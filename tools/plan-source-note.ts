#!/usr/bin/env node

import { SYSTEM_CONFIG } from "./config.js";
import { parseArgs, readJsonInput, writeJsonStdout } from "./lib/cli.js";
import type { CommitInput, JsonObject, LlmSourceNote, MutationPlan, NormalizedSourcePayload } from "./lib/contracts.js";
import { firstMeaningfulParagraph, slugify, stableHash, truncateText } from "./lib/text.js";

interface SourceNotePlanOutput {
  source_payload: NormalizedSourcePayload;
  mutation_plan: MutationPlan;
  commit_input: CommitInput;
}

/**
 * Build the minimal ingestion plan for raw artifacts.
 *
 * This does not replace a richer LLM planner. It creates the safe source-note baseline that every ingestion can apply.
 */

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  if (value.some((item) => typeof item !== "string")) {
    throw new Error("source_note arrays must contain only strings");
  }

  const normalized = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizeSourceNote(value: unknown): LlmSourceNote | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  const summary = stringValue(value.summary);
  const rawContext = stringValue(value.raw_context);

  if (!summary || !rawContext) {
    throw new Error("source_note requires non-empty summary and raw_context");
  }

  return {
    summary,
    raw_context: rawContext,
    extracted_claims: normalizeStringArray(value.extracted_claims),
    open_questions: normalizeStringArray(value.open_questions),
    generated_by: stringValue(value.generated_by),
    model: stringValue(value.model)
  };
}

function normalizePayload(input: unknown): NormalizedSourcePayload {
  if (!isRecord(input)) {
    throw new Error("plan-source-note input must be a normalized source payload object");
  }

  const sourceId = stringValue(input.source_id);
  const sourceKind = stringValue(input.source_kind);
  const capturedAt = stringValue(input.captured_at);
  const rawPath = stringValue(input.raw_path);
  const title = stringValue(input.title);
  const content = typeof input.content === "string" ? input.content : "";

  if (!sourceId || !sourceKind || !capturedAt || !rawPath || !title) {
    throw new Error("Normalized source payload requires source_id, source_kind, captured_at, raw_path, and title");
  }

  return {
    source_id: sourceId,
    source_kind: sourceKind,
    captured_at: new Date(capturedAt).toISOString(),
    raw_path: rawPath,
    title,
    content,
    canonical_url: stringValue(input.canonical_url),
    author: stringValue(input.author),
    language: stringValue(input.language),
    checksum: stringValue(input.checksum),
    metadata: isRecord(input.metadata) ? (input.metadata as JsonObject) : {},
    source_note: normalizeSourceNote(input.source_note)
  };
}

function sourceDate(capturedAt: string): string {
  return new Date(capturedAt).toISOString().slice(0, 10);
}

function safeTimestamp(capturedAt: string): string {
  return new Date(capturedAt).toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
}

function buildSourceNotePath(payload: NormalizedSourcePayload): string {
  const date = sourceDate(payload.captured_at);
  const fallback = slugify(payload.source_id, SYSTEM_CONFIG.ingest.sourceSlugMaxLength, "source");
  const slug = slugify(payload.title, SYSTEM_CONFIG.ingest.sourceSlugMaxLength, fallback);
  return `${SYSTEM_CONFIG.paths.wikiDir}/sources/${date}-${slug}.md`;
}

function buildSummary(content: string, title: string): string {
  const candidate = firstMeaningfulParagraph(content) || title;
  return truncateText(candidate, SYSTEM_CONFIG.ingest.summaryMaxLength);
}

function frontmatterFor(payload: NormalizedSourcePayload): Record<string, unknown> {
  const updated = sourceDate(payload.captured_at);
  const frontmatter: Record<string, unknown> = {
    type: "source",
    title: payload.title,
    source_kind: payload.source_kind,
    source_ref: payload.raw_path,
    source_id: payload.source_id,
    captured_at: payload.captured_at,
    updated
  };

  if (payload.checksum) {
    frontmatter.checksum = payload.checksum;
  }

  if (payload.canonical_url) {
    frontmatter.canonical_url = payload.canonical_url;
  }

  if (payload.author) {
    frontmatter.author = payload.author;
  }

  if (payload.language) {
    frontmatter.language = payload.language;
  }

  if (payload.metadata && Object.keys(payload.metadata).length > 0) {
    frontmatter.metadata = payload.metadata;
  }

  if (payload.source_note) {
    frontmatter.source_note_generated_by = payload.source_note.generated_by || "llm";

    if (payload.source_note.model) {
      frontmatter.source_note_model = payload.source_note.model;
    }
  }

  return frontmatter;
}

function sourceNoteSections(payload: NormalizedSourcePayload): Record<string, string[]> {
  if (payload.source_note) {
    const sections: Record<string, string[]> = {
      Summary: [payload.source_note.summary],
      "Raw Context": [payload.source_note.raw_context]
    };

    if (payload.source_note.extracted_claims && payload.source_note.extracted_claims.length > 0) {
      sections["Extracted Claims"] = payload.source_note.extracted_claims;
    }

    if (payload.source_note.open_questions && payload.source_note.open_questions.length > 0) {
      sections["Open Questions"] = payload.source_note.open_questions;
    }

    return sections;
  }

  const summary = buildSummary(payload.content, payload.title);
  const rawContext = truncateText(payload.content || summary, SYSTEM_CONFIG.ingest.rawContextMaxLength);

  return {
    Summary: [summary],
    "Raw Context": [rawContext]
  };
}

function buildPlan(payload: NormalizedSourcePayload): SourceNotePlanOutput {
  const sourceNotePath = buildSourceNotePath(payload);
  const planId = `plan-${safeTimestamp(payload.captured_at)}-ingest-${stableHash(
    `${payload.source_id}:${payload.raw_path}`,
    SYSTEM_CONFIG.ingest.sourceIdHashLength
  )}`;
  const sourceRefs = [payload.raw_path, sourceNotePath];

  const mutationPlan: MutationPlan = {
    plan_id: planId,
    operation: "ingest",
    summary: `Create source note for ${payload.title}`,
    source_refs: sourceRefs,
    page_actions: [
      {
        path: sourceNotePath,
        action: "create",
        doc_type: "source",
        change_type: "net_new_fact",
        idempotency_key: payload.source_id,
        payload: {
          title: payload.title,
          frontmatter: frontmatterFor(payload),
          sections: sourceNoteSections(payload),
          change_reason: "Initial source ingestion"
        }
      }
    ],
    index_updates: [
      {
        path: SYSTEM_CONFIG.paths.rootIndexPath,
        action: "update",
        change_type: "index_update",
        entries_to_add: [`[[${payload.title}]]`]
      }
    ],
    post_actions: {
      reindex: true,
      commit: true
    }
  };

  const commitInput: CommitInput = {
    operation: "ingest",
    summary: mutationPlan.summary || `Ingest ${payload.title}`,
    source_refs: sourceRefs,
    affected_notes: [sourceNotePath, SYSTEM_CONFIG.paths.rootIndexPath],
    paths_to_stage: [
      sourceNotePath,
      SYSTEM_CONFIG.paths.rootIndexPath,
      SYSTEM_CONFIG.paths.idempotencyLedgerPath,
      SYSTEM_CONFIG.paths.dbPath
    ],
    feedback_record_ref: null,
    mutation_result_ref: null,
    commit_message: `ingest: ${truncateText(payload.title, 60)}`
  };

  return {
    source_payload: payload,
    mutation_plan: mutationPlan,
    commit_input: commitInput
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const payload = normalizePayload(await readJsonInput(args.input));
  writeJsonStdout(buildPlan(payload), args.pretty);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
