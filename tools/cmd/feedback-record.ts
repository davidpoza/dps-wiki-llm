#!/usr/bin/env node

import crypto from "node:crypto";

import { parseArgs, readJsonInput, writeJsonStdout } from "../lib/infra/cli.js";
import { createLogger } from "../lib/infra/logger.js";
import { ensureDirectory, resolveVaultRoot, resolveWithinRoot, writeJsonFile, writeTextFile } from "../lib/storage/fs-utils.js";
import { configuredSet, SYSTEM_CONFIG } from "../config.js";
import { isRecord } from "../lib/core/type-guards.js";
import type {
  FeedbackCandidateItem,
  FeedbackDecision,
  FeedbackOutcome,
  FeedbackRecord,
  MarkdownPayload,
  MutationPlan,
  PageActionKind
} from "../lib/core/contracts.js";

interface GroupedFeedbackEntry {
  path: string;
  action: PageActionKind;
  doc_type: string;
  change_types: Set<string>;
  item_ids: string[];
  payload: MarkdownPayload & {
    sections: Record<string, string[]>;
    related_links: string[];
    frontmatter: Record<string, unknown>;
    change_reason: string;
  };
}

const VALID_DECISIONS = configuredSet(SYSTEM_CONFIG.feedback.validDecisions);
const VALID_OUTCOMES = configuredSet(SYSTEM_CONFIG.feedback.validOutcomes);

/**
 * Normalize feedback decisions and optionally derive a follow-up mutation plan.
 */

async function main(): Promise<void> {
  const args = parseArgs();
  const log = createLogger("feedback-record");
  const vaultRoot = resolveVaultRoot(args.vault);
  log.info("feedback-record started");
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
    await ensureDirectory(resolveWithinRoot(vaultRoot, SYSTEM_CONFIG.paths.feedbackDir));
    await writeJsonFile(resolveWithinRoot(vaultRoot, recordPath), record);
    await writeTextFile(resolveWithinRoot(vaultRoot, summaryPath), renderSummary(record));

    if (mutationPlan && record.mutation_plan_ref) {
      await writeJsonFile(resolveWithinRoot(vaultRoot, record.mutation_plan_ref), mutationPlan);
    }
  }

  log.info({ decision: record.decision, wrote: args.write }, "feedback-record completed");
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

/**
 * Create a filesystem-safe timestamp used in artifact names.
 *
 * @returns {string}
 */
function nowStamp(): string {
  return new Date().toISOString().replaceAll(":", "-");
}

/**
 * Produce a compact slug for artifact and plan identifiers.
 *
 * @param {string} value
 * @returns {string}
 */
function slugify(value: string, maxLength = SYSTEM_CONFIG.feedback.artifactSlugMaxLength): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength);
}

/**
 * Produce a short stable hash for item groupings and idempotency keys.
 *
 * @param {string} value
 * @returns {string}
 */
function stableHash(value: string): string {
  return crypto.createHash("sha1").update(value).digest("hex").slice(0, 10);
}

/**
 * Validate and normalize a single feedback candidate item.
 *
 * @param {unknown} item
 * @param {number} index
 * @returns {Record<string, any>}
 */
function normalizeCandidateItem(item: unknown, index: number): FeedbackCandidateItem {
  if (!isRecord(item)) {
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

  const outcome = (typeof item.outcome === "string" && item.outcome ? item.outcome : "deferred") as FeedbackOutcome;
  if (!VALID_OUTCOMES.has(outcome)) {
    throw new Error(`candidate_items[${index}] has invalid outcome: ${outcome}`);
  }

  return {
    item_id: typeof item.item_id === "string" && item.item_id.trim() ? item.item_id : `item-${String(index + 1).padStart(3, "0")}`,
    target_note: item.target_note as string,
    change_type: item.change_type as string,
    novelty: item.novelty as string,
    source_support: Array.isArray(item.source_support) ? item.source_support.filter((value) => typeof value === "string") : [],
    proposed_content: typeof item.proposed_content === "string" ? item.proposed_content.trim() : "",
    section: typeof item.section === "string" ? item.section.trim() : "",
    action: (typeof item.action === "string" ? item.action : SYSTEM_CONFIG.feedback.defaultCandidateAction) as PageActionKind,
    related_links: Array.isArray(item.related_links) ? item.related_links.filter((value) => typeof value === "string") : [],
    frontmatter: isRecord(item.frontmatter) ? item.frontmatter : {},
    outcome
  };
}

/**
 * Validate the feedback record contract and infer derived fields.
 *
 * @param {unknown} input
 * @returns {Record<string, any>}
 */
function normalizeFeedbackRecord(input: unknown): FeedbackRecord {
  if (!isRecord(input)) {
    throw new Error("Feedback input must be a JSON object");
  }

  if (typeof input.output_id !== "string" || !input.output_id.trim()) {
    throw new Error("Feedback input requires output_id");
  }

  if (!VALID_DECISIONS.has(input.decision as FeedbackDecision)) {
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
    output_id: input.output_id as string,
    decision: input.decision as FeedbackDecision,
    reason: typeof input.reason === "string" ? input.reason : "",
    source_refs: Array.isArray(input.source_refs) ? input.source_refs.filter((value) => typeof value === "string") : [],
    candidate_items: candidateItems,
    affected_notes: Array.isArray(input.affected_notes)
      ? input.affected_notes.filter((value) => typeof value === "string")
      : candidateItems.filter((item) => item.outcome === "applied").map((item) => item.target_note)
  };
}

/**
 * Map a change type to the default markdown section used for propagation.
 *
 * @param {string} changeType
 * @returns {string}
 */
function inferSectionForChangeType(changeType: string): string {
  return SYSTEM_CONFIG.feedback.changeTypeSections[changeType] || SYSTEM_CONFIG.feedback.defaultSection;
}

/**
 * Derive a Mutation Plan from the applied feedback items.
 *
 * @param {{
 *   output_id: string,
 *   reason: string,
 *   source_refs: string[],
 *   candidate_items: Record<string, any>[]
 * }} record
 * @returns {Record<string, any>}
 */
function buildMutationPlan(record: FeedbackRecord): MutationPlan {
  const appliedItems = record.candidate_items.filter((item) => item.outcome === "applied");
  const grouped = new Map<string, GroupedFeedbackEntry>();

  for (const item of appliedItems) {
    const key = item.target_note;
    const entry: GroupedFeedbackEntry =
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

  const pageActions = Array.from(grouped.values()).map((entry) => {
    // Topics are created exclusively by the user — block any auto-create via feedback.
    const action =
      entry.doc_type === "topic" && entry.action === "create" ? "noop" : entry.action;
    return {
      path: entry.path,
      action,
      doc_type: entry.doc_type,
      change_type: entry.change_types.size === 1 ? Array.from(entry.change_types)[0] : "mixed",
      idempotency_key: `feedback:${record.output_id}:${stableHash(entry.item_ids.sort().join(","))}`,
      payload: entry.payload
    };
  });

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

/**
 * Infer the document type from the target wiki path.
 *
 * @param {string} targetNote
 * @returns {string}
 */
function inferDocType(targetNote: string): string {
  for (const [folder, docType] of Object.entries(SYSTEM_CONFIG.wiki.docTypeFolders)) {
    if (targetNote.includes(`/${folder}/`)) {
      return docType;
    }
  }

  return "unknown";
}

/**
 * Build the canonical feedback-record artifact path.
 *
 * @param {{ output_id: string }} record
 * @param {string} stamp
 * @returns {string}
 */
function buildFeedbackRecordPath(record: Pick<FeedbackRecord, "output_id">, stamp: string): string {
  return `${SYSTEM_CONFIG.paths.feedbackDir}/${stamp}-${slugify(record.output_id)}-feedback.json`;
}

/**
 * Build the human-readable feedback summary path.
 *
 * @param {{ output_id: string }} record
 * @param {string} stamp
 * @returns {string}
 */
function buildFeedbackSummaryPath(record: Pick<FeedbackRecord, "output_id">, stamp: string): string {
  return `${SYSTEM_CONFIG.paths.feedbackDir}/${stamp}-${slugify(record.output_id)}-feedback-summary.md`;
}

/**
 * Build the derived mutation-plan path for propagate decisions.
 *
 * @param {{ output_id: string }} record
 * @param {string} stamp
 * @returns {string}
 */
function buildMutationPlanPath(record: Pick<FeedbackRecord, "output_id">, stamp: string): string {
  return `${SYSTEM_CONFIG.paths.feedbackDir}/${stamp}-${slugify(record.output_id)}-mutation-plan.json`;
}

/**
 * Render a compact markdown summary for human review.
 *
 * @param {{ output_id: string, decision: string, reason: string, candidate_items: Record<string, any>[] }} record
 * @returns {string}
 */
function renderSummary(record: FeedbackRecord): string {
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
