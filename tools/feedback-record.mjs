#!/usr/bin/env node

import crypto from "node:crypto";

import { parseArgs, readJsonInput, writeJsonStdout } from "./lib/cli.mjs";
import { ensureDirectory, resolveVaultRoot, resolveWithinRoot, writeJsonFile, writeTextFile } from "./lib/fs-utils.mjs";

const VALID_DECISIONS = new Set(["none", "output_only", "propagate"]);
const VALID_OUTCOMES = new Set(["applied", "rejected", "deferred"]);

async function main() {
  const args = parseArgs();
  const vaultRoot = resolveVaultRoot(args.vault);
  const input = await readJsonInput(args.input);
  const record = normalizeFeedbackRecord(input);
  const stamp = nowStamp();

  let mutationPlan = null;
  if (record.decision === "propagate") {
    mutationPlan = buildMutationPlan(record);
    record.mutation_plan_ref = buildMutationPlanPath(record, stamp);
  }

  const recordPath = buildFeedbackRecordPath(record, stamp);
  const summaryPath = buildFeedbackSummaryPath(record, stamp);

  if (args.write) {
    await ensureDirectory(resolveWithinRoot(vaultRoot, "state/feedback"));
    await writeJsonFile(resolveWithinRoot(vaultRoot, recordPath), record);
    await writeTextFile(resolveWithinRoot(vaultRoot, summaryPath), renderSummary(record));

    if (mutationPlan) {
      await writeJsonFile(resolveWithinRoot(vaultRoot, record.mutation_plan_ref), mutationPlan);
    }
  }

  writeJsonStdout(
    {
      record,
      record_path: recordPath,
      summary_path: summaryPath,
      mutation_plan_path: mutationPlan ? record.mutation_plan_ref : null
    },
    args.pretty
  );
}

function nowStamp() {
  return new Date().toISOString().replaceAll(":", "-");
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function stableHash(value) {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 10);
}

function normalizeCandidateItem(item, index) {
  if (!item || typeof item !== "object") {
    throw new Error(`candidate_items[${index}] must be an object`);
  }

  if (typeof item.target_note !== "string" || !item.target_note.trim()) {
    throw new Error(`candidate_items[${index}] requires target_note`);
  }

  if (typeof item.change_type !== "string" || !item.change_type.trim()) {
    throw new Error(`candidate_items[${index}] requires change_type`);
  }

  if (typeof item.novelty !== "string" || !item.novelty.trim()) {
    throw new Error(`candidate_items[${index}] requires novelty`);
  }

  const outcome = item.outcome || "deferred";
  if (!VALID_OUTCOMES.has(outcome)) {
    throw new Error(`candidate_items[${index}] has invalid outcome: ${outcome}`);
  }

  return {
    item_id: item.item_id || `item-${String(index + 1).padStart(3, "0")}`,
    target_note: item.target_note,
    change_type: item.change_type,
    novelty: item.novelty,
    source_support: Array.isArray(item.source_support) ? item.source_support : [],
    proposed_content: typeof item.proposed_content === "string" ? item.proposed_content.trim() : "",
    section: typeof item.section === "string" ? item.section.trim() : "",
    action: typeof item.action === "string" ? item.action : "update",
    related_links: Array.isArray(item.related_links) ? item.related_links.filter(Boolean) : [],
    frontmatter: item.frontmatter && typeof item.frontmatter === "object" ? item.frontmatter : {},
    outcome
  };
}

function normalizeFeedbackRecord(input) {
  if (!input || typeof input !== "object") {
    throw new Error("Feedback input must be a JSON object");
  }

  if (typeof input.output_id !== "string" || !input.output_id.trim()) {
    throw new Error("Feedback input requires output_id");
  }

  if (!VALID_DECISIONS.has(input.decision)) {
    throw new Error(`Feedback input requires decision in: ${Array.from(VALID_DECISIONS).join(", ")}`);
  }

  const candidateItems = Array.isArray(input.candidate_items)
    ? input.candidate_items.map(normalizeCandidateItem)
    : [];

  if (input.decision === "propagate" && candidateItems.every((item) => item.outcome !== "applied")) {
    throw new Error('Feedback decision "propagate" requires at least one candidate item with outcome "applied"');
  }

  for (const [index, item] of candidateItems.entries()) {
    if (item.outcome === "applied" && item.source_support.length === 0) {
      throw new Error(`candidate_items[${index}] cannot be applied without source_support`);
    }
  }

  return {
    output_id: input.output_id,
    decision: input.decision,
    reason: typeof input.reason === "string" ? input.reason : "",
    source_refs: Array.isArray(input.source_refs) ? input.source_refs : [],
    candidate_items: candidateItems,
    affected_notes: Array.isArray(input.affected_notes)
      ? input.affected_notes
      : candidateItems.filter((item) => item.outcome === "applied").map((item) => item.target_note)
  };
}

function inferSectionForChangeType(changeType) {
  switch (changeType) {
    case "net_new_fact":
    case "fact":
    case "correction":
      return "Facts";
    case "better_wording":
      return "Interpretation";
    case "new_link":
      return "Related";
    case "open_question":
      return "Open Questions";
    case "split_suggestion":
      return "Open Questions";
    default:
      return "Interpretation";
  }
}

function buildMutationPlan(record) {
  const appliedItems = record.candidate_items.filter((item) => item.outcome === "applied");
  const grouped = new Map();

  for (const item of appliedItems) {
    const key = item.target_note;
    const entry =
      grouped.get(key) ||
      {
        path: item.target_note,
        action: item.action || "update",
        doc_type: inferDocType(item.target_note),
        change_types: new Set(),
        item_ids: [],
        payload: {
          sections: {},
          related_links: [],
          frontmatter: { ...item.frontmatter },
          change_reason: `Feedback propagation from ${record.output_id}`
        }
      };

    entry.change_types.add(item.change_type);
    entry.item_ids.push(item.item_id);
    Object.assign(entry.payload.frontmatter, item.frontmatter || {});

    if (item.related_links.length > 0 || item.change_type === "new_link") {
      const links = item.related_links.length > 0 ? item.related_links : [item.proposed_content];
      entry.payload.related_links.push(...links);
    } else {
      const sectionName = item.section || inferSectionForChangeType(item.change_type);
      const bucket = entry.payload.sections[sectionName] || [];
      if (item.proposed_content) {
        bucket.push(item.proposed_content);
      }
      entry.payload.sections[sectionName] = bucket;
    }

    grouped.set(key, entry);
  }

  const pageActions = Array.from(grouped.values()).map((entry) => ({
    path: entry.path,
    action: entry.action,
    doc_type: entry.doc_type,
    change_type: entry.change_types.size === 1 ? Array.from(entry.change_types)[0] : "mixed",
    idempotency_key: `feedback:${record.output_id}:${stableHash(entry.item_ids.sort().join(","))}`,
    payload: entry.payload
  }));

  return {
    plan_id: `plan-${slugify(record.output_id)}-feedback`,
    operation: "feedback",
    summary: record.reason || `Feedback propagation for ${record.output_id}`,
    source_refs: record.source_refs,
    page_actions: pageActions,
    index_updates: [],
    post_actions: {
      reindex: true,
      commit: true
    }
  };
}

function inferDocType(targetNote) {
  if (targetNote.includes("/concepts/")) {
    return "concept";
  }

  if (targetNote.includes("/entities/")) {
    return "entity";
  }

  if (targetNote.includes("/topics/")) {
    return "topic";
  }

  if (targetNote.includes("/sources/")) {
    return "source";
  }

  if (targetNote.includes("/analyses/")) {
    return "analysis";
  }

  return "unknown";
}

function buildFeedbackRecordPath(record, stamp) {
  return `state/feedback/${stamp}-${slugify(record.output_id)}-feedback.json`;
}

function buildFeedbackSummaryPath(record, stamp) {
  return `state/feedback/${stamp}-${slugify(record.output_id)}-feedback-summary.md`;
}

function buildMutationPlanPath(record, stamp) {
  return `state/feedback/${stamp}-${slugify(record.output_id)}-mutation-plan.json`;
}

function renderSummary(record) {
  const lines = [
    `# Feedback Summary: ${record.output_id}`,
    "",
    `- Decision: \`${record.decision}\``,
    `- Reason: ${record.reason || "n/a"}`,
    "",
    "| Target Note | Change Type | Source Support | Outcome |",
    "|-------------|-------------|----------------|---------|"
  ];

  for (const item of record.candidate_items) {
    lines.push(
      `| ${item.target_note} | ${item.change_type} | ${item.source_support.join(", ") || "n/a"} | ${item.outcome} |`
    );
  }

  return `${lines.join("\n")}\n`;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
