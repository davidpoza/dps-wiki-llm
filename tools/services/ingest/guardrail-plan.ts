import type { Logger } from "pino";

import type {
  AnswerContextDoc,
  MutationPlan
} from "../../lib/contracts.js";
import type { ChatCompletionResponse } from "../../lib/llm.js";
import { chatText, extractJson } from "../../lib/llm.js";

import { ALLOWED_PAGE_PREFIXES } from "./build-llm-plan.js";

export type GuardrailRejection = {
  path: string | null;
  action: string | null;
  reason: string;
};

export type GuardrailPlanResult = {
  plan: MutationPlan;
  rejections: GuardrailRejection[];
  hasChanges: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isSafeRelativePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    !value.startsWith("/") &&
    !value.includes("..") &&
    !value.includes("\\")
  );
}

function slugFromPath(path: string): string {
  return path.split("/").pop()?.replace(/\.md$/, "") ?? path;
}

function wikiLinkForDoc(doc: Pick<AnswerContextDoc, "title" | "path">): string {
  const slug = slugFromPath(doc.path);
  return doc.title ? `[[${slug}|${doc.title}]]` : `[[${slug}]]`;
}

function sectionValues(value: unknown): string[] {
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function hasOnlyLinkedNotesSection(action: Record<string, unknown>): boolean {
  const payload = action.payload;
  if (!isRecord(payload)) return false;
  const payloadKeys = Object.keys(payload).filter(
    (key) => payload[key] !== undefined
  );
  if (payloadKeys.some((key) => key !== "sections")) return false;
  const sections = payload.sections;
  if (!isRecord(sections)) return false;
  const sectionKeys = Object.keys(sections).filter(
    (key) => sections[key] !== undefined
  );
  if (sectionKeys.length !== 1 || sectionKeys[0] !== "Linked Notes") return false;
  const linkedNotes = sections["Linked Notes"];
  if (typeof linkedNotes === "string") return Boolean(linkedNotes.trim());
  return (
    Array.isArray(linkedNotes) &&
    linkedNotes.length > 0 &&
    linkedNotes.every(
      (item) => typeof item === "string" && item.trim()
    )
  );
}

function hasWikiContextSupport(
  action: Record<string, unknown>,
  allowedSupportingLinks: Set<string>
): boolean {
  if (allowedSupportingLinks.size === 0) return false;
  const payload = action.payload;
  if (!isRecord(payload) || !isRecord(payload.sections)) return false;
  return sectionValues(payload.sections.Sources).some((link) =>
    allowedSupportingLinks.has(link)
  );
}

function defaultLlmPlanId(baselinePlan: MutationPlan): string {
  return `${baselinePlan.plan_id}-llm-ingest-review`;
}

function defaultLlmSourceRefs(baselinePlan: MutationPlan): string[] {
  return Array.isArray(baselinePlan.source_refs)
    ? baselinePlan.source_refs.filter(Boolean)
    : [];
}

function reject(
  collection: GuardrailRejection[],
  item: unknown,
  reason: string,
  log: Logger
): void {
  const record = isRecord(item) ? item : {};
  const entry: GuardrailRejection = {
    path: typeof record.path === "string" ? record.path : null,
    action: typeof record.action === "string" ? record.action : null,
    reason
  };
  collection.push(entry);
  log.warn(
    { phase: "guardrail-plan", path: entry.path, action: entry.action, reason },
    `guardrail-plan: rejection — ${reason}`
  );
  if (isRecord(item)) item.action = "noop";
}

function planReject(
  collection: GuardrailRejection[],
  reason: string,
  log: Logger
): void {
  collection.push({ path: null, action: null, reason });
  log.warn(
    { phase: "guardrail-plan", reason },
    `guardrail-plan: plan-level rejection — ${reason}`
  );
}

/**
 * Parse the raw LLM ingest plan response and apply safety guardrails:
 * - path whitelist enforcement (allowed wiki path prefixes)
 * - unsafe path detection (traversal, absolute paths)
 * - source note backlink restrictions (Linked Notes only)
 * - wiki context support requirement (Sources must cite a wiki_context note)
 * - idempotency_key presence for all write actions
 *
 * Any action that fails a check is downgraded to noop and recorded as a rejection.
 */
export function parseAndGuardrailPlan(
  response: ChatCompletionResponse,
  baselinePlan: MutationPlan,
  wikiContextDocs: AnswerContextDoc[],
  log: Logger
): GuardrailPlanResult {
  const rejections: GuardrailRejection[] = [];

  let rawPlan: unknown;
  try {
    rawPlan = extractJson(chatText(response, "LLM ingest planner"));
  } catch (error) {
    const reason = `malformed LLM ingest plan JSON: ${error instanceof Error ? error.message : String(error)}`;
    log.error(
      { phase: "guardrail-plan", reason },
      "guardrail-plan: failed to parse LLM plan JSON"
    );
    return {
      plan: {
        plan_id: defaultLlmPlanId(baselinePlan),
        operation: "ingest",
        summary: "Skipped malformed LLM ingest plan",
        source_refs: defaultLlmSourceRefs(baselinePlan),
        page_actions: [],
        index_updates: [],
        post_actions: { reindex: true, commit: true }
      },
      rejections: [{ path: null, action: null, reason }],
      hasChanges: false
    };
  }

  if (!isRecord(rawPlan)) {
    log.error(
      { phase: "guardrail-plan" },
      "guardrail-plan: LLM plan is not a JSON object"
    );
    return {
      plan: {
        plan_id: defaultLlmPlanId(baselinePlan),
        operation: "ingest",
        summary: "Skipped non-object LLM ingest plan",
        source_refs: defaultLlmSourceRefs(baselinePlan),
        page_actions: [],
        index_updates: [],
        post_actions: { reindex: true, commit: true }
      },
      rejections: [
        { path: null, action: null, reason: "LLM ingest plan must be an object" }
      ],
      hasChanges: false
    };
  }

  // ── plan-level field normalization ──────────────────────────────────────────

  if (typeof rawPlan.plan_id !== "string" || !rawPlan.plan_id.trim()) {
    rawPlan.plan_id = defaultLlmPlanId(baselinePlan);
    planReject(rejections, "LLM ingest plan missing plan_id; using fallback plan_id", log);
  }

  if (!Array.isArray(rawPlan.source_refs) || rawPlan.source_refs.length === 0) {
    rawPlan.source_refs = defaultLlmSourceRefs(baselinePlan);
    planReject(rejections, "LLM ingest plan missing source_refs[]; using baseline source_refs", log);
  } else {
    const normalized = (rawPlan.source_refs as unknown[]).filter(
      (item): item is string => typeof item === "string" && Boolean(item.trim())
    );
    rawPlan.source_refs = normalized;
    if (normalized.length === 0) {
      rawPlan.source_refs = defaultLlmSourceRefs(baselinePlan);
      planReject(
        rejections,
        "LLM ingest plan source_refs[] contained no strings; using baseline source_refs",
        log
      );
    }
  }

  if (!Array.isArray(rawPlan.page_actions)) {
    rawPlan.page_actions = [];
    planReject(rejections, "LLM ingest plan missing page_actions[]; treating as no-op", log);
  }

  if (!Array.isArray(rawPlan.index_updates)) {
    rawPlan.index_updates = [];
  }

  // ── per-action validation ───────────────────────────────────────────────────

  const baselineSourceNotePath = baselinePlan.page_actions?.[0]?.path;
  const baselineSourceNoteTitle = baselinePlan.page_actions?.[0]?.payload?.title;
  const baselineSourceNoteSlug =
    typeof baselineSourceNotePath === "string"
      ? slugFromPath(baselineSourceNotePath)
      : null;
  const baselineSourceNoteLink =
    baselineSourceNoteSlug && typeof baselineSourceNoteTitle === "string" && baselineSourceNoteTitle.trim()
      ? `[[${baselineSourceNoteSlug}|${baselineSourceNoteTitle}]]`
      : typeof baselineSourceNoteTitle === "string" && baselineSourceNoteTitle.trim()
        ? `[[${baselineSourceNoteTitle}]]`
        : null;

  const allowedSupportingLinks = new Set<string>(
    [
      baselineSourceNoteLink,
      ...wikiContextDocs.map(wikiLinkForDoc)
    ].filter((item): item is string => typeof item === "string" && Boolean(item))
  );

  const validPageActions = new Set(["create", "update", "noop"]);

  const planSourceRefs = rawPlan.source_refs as string[];
  if (
    typeof baselineSourceNotePath === "string" &&
    !planSourceRefs.includes(baselineSourceNotePath)
  ) {
    planSourceRefs.push(baselineSourceNotePath);
    planReject(
      rejections,
      "LLM ingest plan missing baseline source note in source_refs[]; adding it",
      log
    );
  }

  log.info(
    {
      phase: "guardrail-plan",
      page_actions: (rawPlan.page_actions as unknown[]).length,
      index_updates: (rawPlan.index_updates as unknown[]).length,
      allowed_supporting_links: allowedSupportingLinks.size
    },
    "guardrail-plan: validating page actions"
  );

  for (const action of rawPlan.page_actions as unknown[]) {
    if (!isRecord(action)) {
      reject(rejections, action, "LLM page action must be an object", log);
      continue;
    }
    if (!isSafeRelativePath(action.path)) {
      reject(rejections, action, "unsafe page path", log);
      continue;
    }
    const actionPath = action.path as string;
    if (
      typeof action.action !== "string" ||
      !validPageActions.has(action.action)
    ) {
      reject(rejections, action, "unsupported page action", log);
      continue;
    }
    if (!actionPath.endsWith(".md")) {
      reject(rejections, action, "page path is not markdown", log);
      continue;
    }

    const isBaselineUpdate =
      Boolean(baselineSourceNotePath) && actionPath === baselineSourceNotePath;

    if (isBaselineUpdate) {
      if (action.action === "noop") continue;
      if (action.action !== "update") {
        reject(rejections, action, "source note backlink action must be update", log);
        continue;
      }
      if (!hasOnlyLinkedNotesSection(action)) {
        reject(rejections, action, "source note updates may only write Linked Notes", log);
        continue;
      }
      if (
        typeof action.idempotency_key !== "string" ||
        !action.idempotency_key.trim()
      ) {
        reject(rejections, action, "missing idempotency_key", log);
      }
      continue;
    }

    if (!ALLOWED_PAGE_PREFIXES.some((prefix) => actionPath.startsWith(prefix))) {
      reject(rejections, action, "page path outside allowed wiki areas", log);
      continue;
    }
    if (action.action === "create" && actionPath.startsWith("wiki/topics/")) {
      reject(rejections, action, "auto-create of wiki/topics/ notes is forbidden — topics are created exclusively by the user", log);
      continue;
    }
    if (
      action.action !== "noop" &&
      !hasWikiContextSupport(action, allowedSupportingLinks)
    ) {
      reject(
        rejections,
        action,
        "durable wiki updates must include a wiki_context note link in Sources",
        log
      );
      continue;
    }
    if (
      (action.action === "create" || action.action === "update") &&
      (typeof action.idempotency_key !== "string" ||
        !action.idempotency_key.trim())
    ) {
      reject(rejections, action, "missing idempotency_key", log);
    }
  }

  // ── index update validation ─────────────────────────────────────────────────

  const validIndexActions = new Set(["create", "update", "noop", undefined]);
  for (const update of rawPlan.index_updates as unknown[]) {
    if (!isRecord(update)) {
      reject(rejections, update, "LLM index update must be an object", log);
      continue;
    }
    if (!isSafeRelativePath(update.path)) {
      reject(rejections, update, "unsafe index path", log);
      continue;
    }
    if (!validIndexActions.has(update.action as string | undefined)) {
      reject(rejections, update, "unsupported index action", log);
      continue;
    }
    if (
      !(
        update.path === "INDEX.md" ||
        (String(update.path).startsWith("wiki/indexes/") &&
          String(update.path).endsWith(".md"))
      )
    ) {
      reject(rejections, update, "index path outside allowed index areas", log);
    }
  }

  const plan = rawPlan as unknown as MutationPlan;
  const hasChanges =
    plan.page_actions.some((a) => a.action !== "noop") ||
    (plan.index_updates ?? []).some(
      (u) => (u.action ?? "update") !== "noop"
    );

  log.info(
    {
      phase: "guardrail-plan",
      plan_id: plan.plan_id,
      rejections: rejections.length,
      has_changes: hasChanges,
      effective_page_actions: plan.page_actions.filter((a) => a.action !== "noop").length
    },
    `guardrail-plan: validation complete — rejections=${rejections.length} has_changes=${hasChanges}`
  );

  return { plan, rejections, hasChanges };
}
