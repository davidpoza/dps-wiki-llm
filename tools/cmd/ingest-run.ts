#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";

import { parseArgs, readJsonInput, writeJsonStdout } from "../lib/infra/cli.js";
import { createLogger } from "../lib/infra/logger.js";
import { resolveVaultRoot, resolveWithinRoot, pathExists, loadJsonFile, writeJsonFile } from "../lib/storage/fs-utils.js";
import { manifestPath, normalizeTextForEmbedding, extractSummarySection } from "../lib/storage/semantic-index.js";
import { truncateText } from "../lib/infra/text.js";
import { isRecord } from "../lib/core/type-guards.js";
import { getGitHead, gitResetHard } from "../lib/infra/git.js";
import { PipelineTx } from "../lib/infra/pipeline-tx.js";
import { SYSTEM_CONFIG } from "../config.js";
import type { LlmMeta } from "../lib/infra/llm.js";
import { chatCompletion, chatText, extractJson, llmMeta } from "../lib/infra/llm.js";
import { runToolJson } from "../lib/infra/run-tool.js";
import { releaseTelegramLockAfterFailure } from "../lib/infra/telegram-lock.js";
import type {
  AnswerContextPacket,
  CommitInput,
  MutationPlan,
  MutationResult,
  NormalizedSourcePayload,
  SearchResult
} from "../lib/core/contracts.js";

import {
  normalizeRawEvent,
  ensureRawEvent
} from "../services/ingest/normalize-event.js";
import type { IngestRawEvent } from "../services/ingest/normalize-event.js";
import { sourceNoteRequest, parseSourceNote } from "../services/ingest/build-source-note.js";
import {
  buildWikiContextQuery,
  ingestPlanRequest
} from "../services/ingest/build-llm-plan.js";
import { parseAndGuardrailPlan } from "../services/ingest/guardrail-plan.js";
import type { GuardrailRejection } from "../services/ingest/guardrail-plan.js";
import { injectTopicTags, injectDefaultConfidence } from "../services/ingest/plan-transforms.js";
import { resolveTerms } from "../services/ingest/resolve-terms.js";
import {
  buildIngestNotification,
  buildIngestFailureNotification
} from "../services/notifications/telegram.js";
import type {
  TelegramBaseFields,
  TelegramMessage
} from "../services/notifications/telegram.js";

const INGEST_WIKI_CONTEXT_LIMIT = 6;
const INGEST_TOPIC_CONTEXT_LIMIT = 4;

type ToolPlanOutput = {
  source_payload: NormalizedSourcePayload;
  mutation_plan: MutationPlan;
  commit_input: CommitInput;
};

type CommitResult = Record<string, unknown>;
type ReindexResult = Record<string, unknown>;

type IngestRunOutput = TelegramBaseFields & {
  status: "baseline_ingest_applied_llm_plan_applied" | "baseline_ingest_applied_no_llm_changes";
  source_payload: NormalizedSourcePayload;
  baseline_mutation_plan: MutationPlan;
  baseline_mutation_result: MutationResult;
  baseline_reindex_result: ReindexResult;
  baseline_commit_result: CommitResult;
  llm_source_note_meta: LlmMeta;
  llm_mutation_plan: MutationPlan;
  llm_guardrail_rejections: GuardrailRejection[];
  llm_plan_approval_required: false;
  llm_plan_auto_apply_required: boolean;
  llm_mutation_result: MutationResult | null;
  llm_reindex_result: ReindexResult | null;
  llm_commit_result: CommitResult | null;
  embed_index_result: Record<string, unknown>;
  summary_applied: string[];
  enrich_result: { updated: string[]; skipped: string[] } | null;
  llm_ingest_meta: LlmMeta;
  telegram_chat_id: unknown;
  telegram_message_id: unknown;
  telegram_update_id: unknown;
  telegram_polled: boolean;
  telegram_command: unknown;
  telegram_lock_acquired: boolean;
  telegram_lock_id: unknown;
  youtube_ingest_url: unknown;
  youtube_transcript_result: unknown;
  telegram_document_file_id: unknown;
  telegram_document_filename: unknown;
  pdf_extract_result: unknown;
  telegram_ingest_message: TelegramMessage | null;
};

function unique(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(
      values.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    )
  ];
}

function buildLlmCommitInput(packet: {
  source_payload: NormalizedSourcePayload;
  llm_mutation_plan: MutationPlan;
  llm_mutation_result: MutationResult;
}): CommitInput {
  const plan = packet.llm_mutation_plan;
  const mutation = packet.llm_mutation_result;
  const title = packet.source_payload.title || packet.source_payload.source_id || "source";
  const indexPaths = Array.isArray(plan.index_updates)
    ? plan.index_updates.map((u) => u.path)
    : [];
  const affected = unique([
    ...(mutation.created ?? []),
    ...(mutation.updated ?? []),
    ...indexPaths
  ]);
  return {
    operation: "ingest",
    summary: `Apply LLM ingest plan for ${title}`,
    source_refs: Array.isArray(plan.source_refs) ? plan.source_refs : [],
    affected_notes: affected,
    paths_to_stage: unique([
      ...affected,
      "state/runtime/idempotency-keys.json",
      "state/kb.db"
    ]),
    feedback_record_ref: null,
    mutation_result_ref: null,
    commit_message: `ingest: apply LLM plan for ${truncateText(title, 60)}`
  };
}

function countOf(values: unknown): number {
  return Array.isArray(values) ? values.length : 0;
}

function topicSlugsFromPlan(plan: MutationPlan): string[] {
  return (plan.page_actions ?? [])
    .filter((a) => a.doc_type === "topic" && a.action !== "noop")
    .map((a) => a.path.split("/").pop()?.replace(/\.md$/, "") ?? "")
    .filter(Boolean);
}

function usageSummary(meta: LlmMeta): Record<string, unknown> {
  const usage = meta.usage as Record<string, unknown> | undefined;
  return usage
    ? {
        prompt_tokens: usage.prompt_tokens ?? null,
        completion_tokens: usage.completion_tokens ?? null,
        total_tokens: usage.total_tokens ?? null
      }
    : {};
}

/**
 * Call the LLM to produce a concise Summary for a wiki note.
 * Returns null if the LLM fails or returns empty text.
 */
async function generateSummaryForNote(
  rawContent: string,
  title: string,
  log: ReturnType<typeof createLogger>
): Promise<string | null> {
  const body = rawContent.replace(/^---[\s\S]*?---\n?/, "").trim();
  const maxBody = 6000;
  const truncatedBody = body.length > maxBody ? `${body.slice(0, maxBody)}\n...[truncated]` : body;

  const messages = [
    {
      role: "system" as const,
      content: `You are a knowledge base curator. Write a concise, information-dense summary of the provided note.
Rules:
- Plain prose only — no headings, no bullet points, no markdown.
- Maximum ${SYSTEM_CONFIG.semantic.summaryMaxLength} characters.
- Capture the key concepts, facts, and relationships so the summary can stand in for the full note in semantic search.
- Do not start with filler phrases like "This note discusses..." — begin directly with the content.
- Respond with only the summary text, nothing else.`
    },
    {
      role: "user" as const,
      content: `Note title: ${title}\n\n${truncatedBody}`
    }
  ];

  try {
    const response = await chatCompletion({ messages, temperature: 0.2 });
    const text = chatText(response, "generate-summary").trim();
    return text.length > 0 ? text.slice(0, SYSTEM_CONFIG.semantic.summaryMaxLength) : null;
  } catch (err) {
    log.warn(
      { err: err instanceof Error ? err.message : String(err) },
      "ingest-run: [summary-gen] LLM call failed"
    );
    return null;
  }
}

async function main(): Promise<void> {
  const args = parseArgs();
  const log = createLogger("ingest-run");
  let lockContext: unknown = null;
  const tx = new PipelineTx();

  log.info({ phase: "startup" }, "ingest-run: started");

  try {
    // ── 1. read and normalize input ───────────────────────────────────────────

    const input = await readJsonInput<IngestRawEvent>(args.input);
    lockContext = input;

    const initialRawEvent = normalizeRawEvent(input, log);
    lockContext = initialRawEvent;

    // ── 2. resolve raw_path (YouTube fetch if needed) ─────────────────────────

    const ensureResult = await ensureRawEvent(args.vault, initialRawEvent, log);
    lockContext = ensureResult.rawEvent;

    if (!ensureResult.ok) {
      const notification = buildIngestFailureNotification({
        telegram_chat_id: ensureResult.rawEvent.telegram_chat_id,
        youtube_ingest_url:
          typeof ensureResult.rawEvent.youtube_ingest_url === "string"
            ? ensureResult.rawEvent.youtube_ingest_url
            : null,
        reason: ensureResult.reason,
        youtube_video_id: ensureResult.youtubeResult
          ? String(ensureResult.youtubeResult.video_id ?? "")
          : null
      });
      const ctx = ensureResult.rawEvent;
      log.warn(
        { phase: "ensure-raw-event", status: ensureResult.failureStatus, reason: ensureResult.reason },
        `ingest-run: early exit — ${ensureResult.failureStatus}`
      );
      writeJsonStdout(
        {
          status: ensureResult.failureStatus,
          ingest_error: ensureResult.reason,
          youtube_ingest_url: ctx.youtube_ingest_url ?? null,
          youtube_transcript_result: ensureResult.youtubeResult ?? null,
          telegram_document_file_id: ctx.telegram_document_file_id ?? null,
          telegram_document_filename: ctx.telegram_document_filename ?? null,
          pdf_extract_result: ctx.pdf_extract_result ?? null,
          telegram_chat_id: ctx.telegram_chat_id ?? null,
          telegram_message_id: ctx.telegram_message_id ?? null,
          telegram_update_id: ctx.telegram_update_id ?? null,
          telegram_polled: Boolean(ctx.telegram_polled),
          telegram_command: ctx.telegram_command ?? null,
          telegram_lock_acquired: Boolean(ctx.telegram_lock_acquired),
          telegram_lock_id: ctx.telegram_lock_id ?? null,
          ...notification
        },
        args.pretty
      );
      return;
    }

    const rawEvent = ensureResult.rawEvent;

    // ── 3. normalize source payload ───────────────────────────────────────────

    log.info(
      { phase: "ingest-source", trigger_source: rawEvent.trigger_source, raw_path: rawEvent.raw_path },
      "ingest-run: [ingest-source] normalizing source payload"
    );

    const sourcePayload = await runToolJson<NormalizedSourcePayload>("ingest-source", {
      vault: args.vault,
      input: rawEvent
    });

    log.info(
      {
        phase: "ingest-source",
        source_id: sourcePayload.source_id,
        source_kind: sourcePayload.source_kind,
        title_length: sourcePayload.title?.length ?? 0,
        content_length: sourcePayload.content?.length ?? 0
      },
      "ingest-run: [ingest-source] source payload normalized"
    );

    // ── 4. LLM: generate source note ──────────────────────────────────────────

    log.info(
      {
        phase: "source-note/llm",
        source_id: sourcePayload.source_id,
        title: sourcePayload.title?.slice(0, 80)
      },
      "ingest-run: [source-note/llm] requesting source note from LLM"
    );

    const sourceNoteReqBody = sourceNoteRequest(sourcePayload);
    const sourceNoteResponse = await chatCompletion(sourceNoteReqBody);
    const sourceNote = parseSourceNote(sourceNoteResponse, sourceNoteReqBody);
    const sourceNoteMeta = llmMeta(sourceNoteResponse);

    log.info(
      {
        phase: "source-note/llm",
        source_id: sourcePayload.source_id,
        model: sourceNoteMeta.model,
        summary_length: sourceNote.summary?.length ?? 0,
        claims: sourceNote.extracted_claims?.length ?? 0,
        open_questions: sourceNote.open_questions?.length ?? 0,
        ...usageSummary(sourceNoteMeta)
      },
      "ingest-run: [source-note/llm] source note received"
    );

    const sourcePayloadWithNote: NormalizedSourcePayload = {
      ...sourcePayload,
      content: "",
      source_note: sourceNote
    };

    // ── 5. plan baseline source note ──────────────────────────────────────────

    log.info(
      { phase: "plan-source-note", source_id: sourcePayload.source_id },
      "ingest-run: [plan-source-note] building baseline mutation plan"
    );

    const baselinePlanOutput = await runToolJson<ToolPlanOutput>("plan-source-note", {
      vault: args.vault,
      input: sourcePayloadWithNote
    });

    log.info(
      {
        phase: "plan-source-note",
        plan_id: baselinePlanOutput.mutation_plan.plan_id,
        page_actions: baselinePlanOutput.mutation_plan.page_actions?.length ?? 0
      },
      "ingest-run: [plan-source-note] baseline plan ready"
    );

    // ── 6. set up transaction rollback + apply baseline ───────────────────────

    const vaultRoot = resolveVaultRoot(args.vault);
    const idempotencyLedgerAbsPath = resolveWithinRoot(vaultRoot, SYSTEM_CONFIG.paths.idempotencyLedgerPath);
    const preRunIdempotencyKeys = await loadJsonFile<Record<string, unknown>>(idempotencyLedgerAbsPath, {});
    const preRunGitSha = await getGitHead(vaultRoot);

    log.info(
      { phase: "tx-setup", git_sha: preRunGitSha ?? "none", idempotency_keys: Object.keys(preRunIdempotencyKeys).length },
      "ingest-run: [tx-setup] transaction checkpoint captured"
    );

    tx.onRollback("git-reset-hard", async () => {
      if (!preRunGitSha) {
        log.warn("pipeline-tx: git-reset-hard skipped — no git HEAD was captured");
        return;
      }
      await gitResetHard(vaultRoot, preRunGitSha);
    });
    tx.onRollback("restore-idempotency-keys", async () => {
      await writeJsonFile(idempotencyLedgerAbsPath, preRunIdempotencyKeys);
    });
    tx.onRollback("reindex", async () => {
      await runToolJson("reindex", { vault: args.vault });
    });

    log.info(
      {
        phase: "apply-update/baseline",
        plan_id: baselinePlanOutput.mutation_plan.plan_id,
        page_actions: baselinePlanOutput.mutation_plan.page_actions?.length ?? 0
      },
      "ingest-run: [apply-update/baseline] applying baseline mutation plan"
    );

    const baselineMutationResult = await runToolJson<MutationResult>("apply-update", {
      vault: args.vault,
      input: baselinePlanOutput.mutation_plan
    });

    log.info(
      {
        phase: "apply-update/baseline",
        created: countOf(baselineMutationResult.created),
        updated: countOf(baselineMutationResult.updated),
        skipped: countOf(baselineMutationResult.skipped),
        idempotent_hits: countOf(baselineMutationResult.idempotent_hits)
      },
      "ingest-run: [apply-update/baseline] baseline mutations applied"
    );

    // ── 7. reindex (baseline) ─────────────────────────────────────────────────

    log.info({ phase: "reindex/baseline" }, "ingest-run: [reindex/baseline] rebuilding search index");

    const baselineReindexResult = await runToolJson<ReindexResult>("reindex", {
      vault: args.vault
    });

    log.info({ phase: "reindex/baseline" }, "ingest-run: [reindex/baseline] index rebuilt");

    // ── 8. commit (baseline) ──────────────────────────────────────────────────

    log.info(
      {
        phase: "commit/baseline",
        plan_id: baselinePlanOutput.mutation_plan.plan_id,
        affected: countOf(baselinePlanOutput.commit_input.affected_notes)
      },
      "ingest-run: [commit/baseline] committing baseline changes"
    );

    const baselineCommitResult = await runToolJson<CommitResult>("commit", {
      vault: args.vault,
      input: baselinePlanOutput.commit_input
    });

    log.info(
      {
        phase: "commit/baseline",
        commit_sha: baselineCommitResult.commit_sha ?? null,
        committed: baselineCommitResult.committed ?? null
      },
      "ingest-run: [commit/baseline] baseline committed"
    );

    // ── 9. retrieve wiki context ──────────────────────────────────────────────

    const wikiContextQuery = buildWikiContextQuery(sourcePayload, sourceNote);
    const hasSemanticIndex = await pathExists(manifestPath(vaultRoot));
    const wikiContextSearchTool = hasSemanticIndex ? "semantic-search" : "search";

    log.info(
      {
        phase: "wiki-context/search",
        query_length: wikiContextQuery.length,
        general_limit: INGEST_WIKI_CONTEXT_LIMIT,
        topic_limit: INGEST_TOPIC_CONTEXT_LIMIT,
        search_tool: wikiContextSearchTool
      },
      "ingest-run: [wiki-context/search] retrieving related wiki docs"
    );

    const [generalRetrieval, topicRetrievalRaw] = await Promise.all([
      runToolJson<SearchResult>(wikiContextSearchTool, {
        vault: args.vault,
        args: ["--limit", String(INGEST_WIKI_CONTEXT_LIMIT), wikiContextQuery]
      }),
      runToolJson<SearchResult>(wikiContextSearchTool, {
        vault: args.vault,
        args: ["--limit", String(INGEST_TOPIC_CONTEXT_LIMIT), "--doc-type", "topic", wikiContextQuery]
      }).catch((err: unknown) => {
        log.warn(
          { phase: "wiki-context/search", err: err instanceof Error ? err.message : String(err) },
          "ingest-run: [wiki-context/search] topic-specific search failed — skipping topic slots"
        );
        return { query: wikiContextQuery, limit: INGEST_TOPIC_CONTEXT_LIMIT, results: [] } as SearchResult;
      })
    ]);

    // Merge: topics fill guaranteed slots; general results deduplicated against them.
    const seenPaths = new Set(topicRetrievalRaw.results.map((r) => r.path));
    const mergedResults = [
      ...topicRetrievalRaw.results,
      ...generalRetrieval.results.filter((r) => !seenPaths.has(r.path))
    ];

    const wikiContextRetrieval: SearchResult = {
      ...generalRetrieval,
      results: mergedResults
    };

    log.info(
      {
        phase: "wiki-context/search",
        general_results: generalRetrieval.results.length,
        topic_results: topicRetrievalRaw.results.length,
        merged_results: mergedResults.length,
        search_tool: wikiContextSearchTool
      },
      "ingest-run: [wiki-context/search] search completed"
    );

    log.info(
      { phase: "wiki-context/build", search_results: wikiContextRetrieval.results?.length ?? 0 },
      "ingest-run: [wiki-context/build] building answer context packet"
    );

    const wikiContext = await runToolJson<AnswerContextPacket>("answer-context", {
      vault: args.vault,
      input: {
        question: wikiContextQuery,
        retrieval: wikiContextRetrieval,
        should_review_for_feedback: false
      }
    });

    log.info(
      {
        phase: "wiki-context/build",
        context_docs: wikiContext.context_docs?.length ?? 0
      },
      "ingest-run: [wiki-context/build] wiki context packet ready"
    );

    // ── 10. LLM: generate ingest plan ─────────────────────────────────────────

    log.info(
      {
        phase: "ingest-plan/llm",
        source_id: sourcePayload.source_id,
        wiki_docs: wikiContext.context_docs?.length ?? 0
      },
      "ingest-run: [ingest-plan/llm] requesting mutation plan from LLM"
    );

    const ingestPlanReqBody = ingestPlanRequest(
      baselinePlanOutput.source_payload,
      baselinePlanOutput.mutation_plan,
      wikiContext.context_docs
    );
    let ingestPlanResponse = await chatCompletion(ingestPlanReqBody);

    // If the model returned non-JSON (common with free/weak models that ignore
    // response_format or the system-prompt JSON instruction), send a correction
    // message and retry once before handing off to guardrail-plan.
    let ingestPlanJsonValid = false;
    try {
      extractJson(chatText(ingestPlanResponse, "ingest plan JSON validation"));
      ingestPlanJsonValid = true;
    } catch {
      // Response was not valid JSON — attempt correction retry below.
    }

    if (!ingestPlanJsonValid) {
      let priorContent = "";
      try {
        priorContent = chatText(ingestPlanResponse, "ingest plan prior content");
      } catch {
        // Prior response had no extractable text — correction message still sent.
      }

      log.warn(
        { phase: "ingest-plan/llm", prior_content_length: priorContent.length },
        "ingest-run: [ingest-plan/llm] response was not valid JSON — sending correction and retrying"
      );

      const correctionRequest = {
        ...ingestPlanReqBody,
        messages: [
          ...ingestPlanReqBody.messages,
          ...(priorContent ? [{ role: "assistant" as const, content: priorContent }] : []),
          {
            role: "user" as const,
            content:
              "Your previous response was not valid JSON. Return ONLY the JSON object, starting with { and ending with }. No markdown, no wiki links, no prose — only the JSON."
          }
        ]
      };
      ingestPlanResponse = await chatCompletion(correctionRequest);
    }

    const ingestPlanMeta = llmMeta(ingestPlanResponse);

    log.info(
      {
        phase: "ingest-plan/llm",
        model: ingestPlanMeta.model,
        finish_reason: ingestPlanMeta.finish_reason,
        json_valid_on_first_attempt: ingestPlanJsonValid,
        ...usageSummary(ingestPlanMeta)
      },
      "ingest-run: [ingest-plan/llm] LLM plan response received"
    );

    // ── 11. guardrail plan ────────────────────────────────────────────────────

    log.info(
      { phase: "guardrail-plan" },
      "ingest-run: [guardrail-plan] validating LLM plan"
    );

    const { plan: guardrailedPlan, rejections, hasChanges: guardrailHasChanges } = parseAndGuardrailPlan(
      ingestPlanResponse,
      baselinePlanOutput.mutation_plan,
      wikiContext.context_docs,
      log
    );

    // ── 11b. resolve terms (topic matching + concept dedup) ───────────────────

    log.info(
      { phase: "resolve-terms" },
      "ingest-run: [resolve-terms] resolving term candidates against existing topics and concepts"
    );

    const resolveResult = await resolveTerms(guardrailedPlan, vaultRoot, log);

    log.info(
      {
        phase: "resolve-terms",
        topic_matches: resolveResult.topicMatches,
        concept_matches: resolveResult.conceptMatches,
        concept_dedups: resolveResult.conceptDedups,
        nooped: resolveResult.nooped
      },
      "ingest-run: [resolve-terms] term resolution complete"
    );

    const sourceNotePath = baselinePlanOutput.mutation_plan.page_actions[0]?.path ?? "";
    const topicSlugs = topicSlugsFromPlan(resolveResult.plan);
    const planWithTags = injectTopicTags(resolveResult.plan, sourceNotePath, topicSlugs);
    const llmMutationPlan = injectDefaultConfidence(planWithTags, SYSTEM_CONFIG.health.defaultConfidence);
    const hasChanges = guardrailHasChanges || resolveResult.topicMatches > 0 || resolveResult.conceptMatches > 0 || resolveResult.conceptDedups > 0
      || resolveResult.plan.page_actions.some((a) => a.action !== "noop")
      || topicSlugs.length > 0;

    log.info(
      { phase: "inject-topic-tags", source_note_path: sourceNotePath, topic_slugs: topicSlugs },
      `ingest-run: [inject-topic-tags] injected ${topicSlugs.length} topic tag(s) into source note`
    );

    // ── 12. apply LLM plan (conditional) ─────────────────────────────────────

    let llmMutationResult: MutationResult | null = null;
    let llmReindexResult: ReindexResult | null = null;
    let llmCommitResult: CommitResult | null = null;

    if (hasChanges) {
      log.info(
        {
          phase: "apply-update/llm",
          plan_id: llmMutationPlan.plan_id,
          page_actions: llmMutationPlan.page_actions?.length ?? 0
        },
        "ingest-run: [apply-update/llm] applying LLM mutation plan"
      );

      llmMutationResult = await runToolJson<MutationResult>("apply-update", {
        vault: args.vault,
        input: llmMutationPlan
      });

      log.info(
        {
          phase: "apply-update/llm",
          created: countOf(llmMutationResult.created),
          updated: countOf(llmMutationResult.updated),
          skipped: countOf(llmMutationResult.skipped),
          idempotent_hits: countOf(llmMutationResult.idempotent_hits)
        },
        "ingest-run: [apply-update/llm] LLM mutations applied"
      );

      log.info({ phase: "reindex/llm" }, "ingest-run: [reindex/llm] rebuilding search index");

      llmReindexResult = await runToolJson<ReindexResult>("reindex", {
        vault: args.vault
      });

      log.info({ phase: "reindex/llm" }, "ingest-run: [reindex/llm] index rebuilt");

      const llmCommitInput = buildLlmCommitInput({
        source_payload: baselinePlanOutput.source_payload,
        llm_mutation_plan: llmMutationPlan,
        llm_mutation_result: llmMutationResult
      });

      log.info(
        {
          phase: "commit/llm",
          affected: countOf(llmCommitInput.affected_notes)
        },
        "ingest-run: [commit/llm] committing LLM plan changes"
      );

      llmCommitResult = await runToolJson<CommitResult>("commit", {
        vault: args.vault,
        input: llmCommitInput
      });

      log.info(
        {
          phase: "commit/llm",
          commit_sha: llmCommitResult.commit_sha ?? null,
          committed: llmCommitResult.committed ?? null
        },
        "ingest-run: [commit/llm] LLM changes committed"
      );
    } else {
      log.info(
        { phase: "apply-update/llm" },
        "ingest-run: [apply-update/llm] no effective changes in LLM plan — skipping apply/reindex/commit"
      );
    }

    // ── 12.5. generate Summary for long notes ────────────────────────────────
    // Runs before embed-index so that the Summary content is included in the
    // semantic vectors rather than a truncated prefix of the full text.
    // Only applied to wiki/concepts/ and wiki/sources/ that exceed maxInputChars
    // and don't already have a ## Summary section.

    const summaryTargetPaths = unique([
      ...baselineMutationResult.created,
      ...(llmMutationResult?.created ?? []),
      ...(llmMutationResult?.updated ?? [])
    ]).filter((p) => p.startsWith("wiki/concepts/") || p.startsWith("wiki/sources/"));

    const summaryApplied: string[] = [];

    if (summaryTargetPaths.length > 0) {
      log.info(
        { phase: "summary-gen/start", candidates: summaryTargetPaths.length },
        "ingest-run: [summary-gen] checking notes for Summary generation"
      );

      for (const relPath of summaryTargetPaths) {
        const absPath = resolveWithinRoot(vaultRoot, relPath);
        let rawContent: string;

        try {
          rawContent = await fs.readFile(absPath, "utf8");
        } catch {
          continue;
        }

        const normalized = normalizeTextForEmbedding(rawContent);
        if (normalized.length <= SYSTEM_CONFIG.semantic.maxInputChars) continue;
        if (extractSummarySection(rawContent)) continue;

        const titleMatch = rawContent.match(/^# (.+)/m);
        const noteTitle = titleMatch ? titleMatch[1].trim() : path.basename(relPath, ".md");

        log.info(
          { phase: "summary-gen/generate", path: relPath, normalized_chars: normalized.length },
          "ingest-run: [summary-gen] generating Summary via LLM"
        );

        const summaryText = await generateSummaryForNote(rawContent, noteTitle, log);
        if (!summaryText) continue;

        const summaryPlan: MutationPlan = {
          plan_id: `ingest-summary-${path.basename(relPath, ".md")}-${Date.now()}`,
          operation: "ingest",
          summary: `ingest: add ## Summary to ${relPath}`,
          source_refs: [],
          page_actions: [{
            path: relPath,
            action: "update" as const,
            change_type: "summary_added",
            payload: { sections: { Summary: summaryText } }
          }],
          index_updates: [],
          post_actions: { reindex: false, commit: false }
        };

        try {
          await runToolJson("apply-update", { vault: args.vault, input: summaryPlan });
          summaryApplied.push(relPath);
          log.info(
            { phase: "summary-gen/applied", path: relPath, summary_chars: summaryText.length },
            "ingest-run: [summary-gen] Summary applied"
          );
        } catch (err) {
          log.warn(
            { phase: "summary-gen/error", path: relPath, err: err instanceof Error ? err.message : String(err) },
            "ingest-run: [summary-gen] apply-update failed — skipping"
          );
        }
      }

      if (summaryApplied.length > 0) {
        await runToolJson("reindex", { vault: args.vault });
        const summaryCommitInput: CommitInput = {
          operation: "ingest",
          summary: `ingest: add Summary section to ${summaryApplied.length} note(s)`,
          source_refs: [],
          affected_notes: summaryApplied,
          paths_to_stage: [...summaryApplied, SYSTEM_CONFIG.paths.dbPath],
          feedback_record_ref: null,
          mutation_result_ref: null,
          commit_message: `ingest: add Summary to ${summaryApplied.length} note(s) for ${truncateText(sourcePayload.title || "source", 40)}`
        };
        await runToolJson("commit", { vault: args.vault, input: summaryCommitInput });
        log.info(
          { phase: "summary-gen/done", applied: summaryApplied.length },
          "ingest-run: [summary-gen] Summary sections committed"
        );
      }
    }

    // ── 13. embed-index (incremental) ────────────────────────────────────────

    log.info({ phase: "embed-index" }, "ingest-run: [embed-index] updating semantic index");

    const embedIndexResult = await runToolJson<Record<string, unknown>>("embed-index", {
      vault: args.vault
    });

    log.info(
      {
        phase: "embed-index",
        embedded: embedIndexResult.embedded ?? null,
        skipped: embedIndexResult.skipped ?? null,
        total: embedIndexResult.total ?? null,
        model: embedIndexResult.model ?? null
      },
      "ingest-run: [embed-index] semantic index updated"
    );

    // ── 13.5. enrich Related links ───────────────────────────────────────────
    // Runs after embed-index so the fresh semantic vectors are available.
    // Targets all notes created/updated in this ingest run.

    const enrichTargetPaths = unique([
      ...baselineMutationResult.created,
      ...(llmMutationResult?.created ?? []),
      ...(llmMutationResult?.updated ?? []),
      ...summaryApplied
    ]);

    let enrichResult: { updated: string[]; skipped: string[] } | null = null;

    if (enrichTargetPaths.length > 0) {
      log.info(
        { phase: "enrich-links/start", paths: enrichTargetPaths.length },
        "ingest-run: [enrich-links] discovering Related links for ingested notes"
      );

      try {
        enrichResult = await runToolJson<{ status: string; updated: string[]; skipped: string[] }>(
          "enrich-links",
          { vault: args.vault, args: ["--paths", ...enrichTargetPaths] }
        );

        log.info(
          { phase: "enrich-links/done", updated: enrichResult.updated.length, skipped: enrichResult.skipped.length },
          "ingest-run: [enrich-links] Related link discovery complete"
        );

        if (enrichResult.updated.length > 0) {
          await runToolJson("reindex", { vault: args.vault });
          const enrichCommitInput: CommitInput = {
            operation: "ingest",
            summary: `ingest: enrich Related links in ${enrichResult.updated.length} note(s)`,
            source_refs: [],
            affected_notes: enrichResult.updated,
            paths_to_stage: [...enrichResult.updated, SYSTEM_CONFIG.paths.dbPath],
            feedback_record_ref: null,
            mutation_result_ref: null,
            commit_message: `ingest: enrich Related links for ${truncateText(sourcePayload.title || "source", 50)}`
          };
          await runToolJson("commit", { vault: args.vault, input: enrichCommitInput });
          log.info(
            { phase: "enrich-links/committed", updated: enrichResult.updated.length },
            "ingest-run: [enrich-links] Related links committed"
          );
        }
      } catch (err) {
        log.warn(
          { phase: "enrich-links/error", err: err instanceof Error ? err.message : String(err) },
          "ingest-run: [enrich-links] failed — skipping (non-fatal)"
        );
      }
    }

    // ── 14. build output ──────────────────────────────────────────────────────

    const source = baselinePlanOutput.source_payload;
    const status = llmMutationResult
      ? "baseline_ingest_applied_llm_plan_applied"
      : "baseline_ingest_applied_no_llm_changes";

    const notification = buildIngestNotification({
      telegram_chat_id: rawEvent.telegram_chat_id,
      status,
      source_title: source.title,
      source_id: source.source_id,
      raw_path: source.raw_path,
      baseline_mutation_result: baselineMutationResult,
      llm_mutation_result: llmMutationResult,
      guardrail_rejections: rejections.length,
      baseline_commit_sha:
        typeof baselineCommitResult.commit_sha === "string"
          ? baselineCommitResult.commit_sha
          : null,
      llm_commit_sha:
        llmCommitResult && typeof llmCommitResult.commit_sha === "string"
          ? llmCommitResult.commit_sha
          : null
    });

    const output: IngestRunOutput = {
      status,
      source_payload: source,
      baseline_mutation_plan: baselinePlanOutput.mutation_plan,
      baseline_mutation_result: baselineMutationResult,
      baseline_reindex_result: baselineReindexResult,
      baseline_commit_result: baselineCommitResult,
      llm_source_note_meta: sourceNoteMeta,
      llm_mutation_plan: llmMutationPlan,
      llm_guardrail_rejections: rejections,
      llm_plan_approval_required: false,
      llm_plan_auto_apply_required: hasChanges,
      llm_mutation_result: llmMutationResult,
      llm_reindex_result: llmReindexResult,
      llm_commit_result: llmCommitResult,
      embed_index_result: embedIndexResult,
      summary_applied: summaryApplied,
      enrich_result: enrichResult,
      llm_ingest_meta: ingestPlanMeta,
      telegram_chat_id: rawEvent.telegram_chat_id ?? null,
      telegram_message_id: rawEvent.telegram_message_id ?? null,
      telegram_update_id: rawEvent.telegram_update_id ?? null,
      telegram_polled: Boolean(rawEvent.telegram_polled),
      telegram_command: rawEvent.telegram_command ?? null,
      telegram_lock_acquired: Boolean(rawEvent.telegram_lock_acquired),
      telegram_lock_id: rawEvent.telegram_lock_id ?? null,
      youtube_ingest_url: rawEvent.youtube_ingest_url ?? null,
      youtube_transcript_result: rawEvent.youtube_transcript_result ?? null,
      telegram_document_file_id: rawEvent.telegram_document_file_id ?? null,
      telegram_document_filename: rawEvent.telegram_document_filename ?? null,
      pdf_extract_result: rawEvent.pdf_extract_result ?? null,
      ...notification
    };

    log.info(
      {
        phase: "done",
        status,
        source_id: source.source_id,
        baseline_created: countOf(baselineMutationResult.created),
        baseline_updated: countOf(baselineMutationResult.updated),
        llm_created: countOf(llmMutationResult?.created),
        llm_updated: countOf(llmMutationResult?.updated),
        guardrail_rejections: rejections.length,
        baseline_commit_sha: baselineCommitResult.commit_sha ?? null,
        llm_commit_sha: llmCommitResult?.commit_sha ?? null,
        embed_indexed: embedIndexResult.embedded ?? null,
        summary_applied: summaryApplied.length,
        enrich_updated: enrichResult?.updated.length ?? 0
      },
      "ingest-run: completed"
    );

    writeJsonStdout(output, args.pretty);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    log.error(
      { phase: "error", err: reason },
      "ingest-run: pipeline failed — rolling back mutations and releasing lock"
    );

    await tx.rollback(log);
    await releaseTelegramLockAfterFailure(args.vault, lockContext, "ingest-run");

    // IMPORTANT: write a failure JSON to stdout and exit with code 0 instead of re-throwing.
    //
    // If we exit with code 1 here, N8N's executeCommand node fails and the workflow stops
    // before reaching "Finalize Ingest Response". That node is responsible for updating
    // staticData.telegram_last_update_id, which tells the next Telegram poll to advance
    // past this update (offset = last_id + 1). Without it, the same update is retried on
    // every poll cycle → infinite loop on the same command.
    //
    // By writing a structured failure output and exiting cleanly, N8N continues the workflow,
    // "Finalize Ingest Response" runs, the update is marked, and the Telegram message with
    // the failure reason is sent to the user.
    const ctx = isRecord(lockContext) ? lockContext : {};
    const notification = buildIngestFailureNotification({
      telegram_chat_id: ctx.telegram_chat_id ?? null,
      youtube_ingest_url:
        typeof ctx.youtube_ingest_url === "string" ? ctx.youtube_ingest_url : null,
      reason,
      youtube_video_id: isRecord(ctx.youtube_transcript_result)
        ? String(ctx.youtube_transcript_result.video_id ?? "")
        : null
    });

    writeJsonStdout(
      {
        status: "ingest_pipeline_failed",
        ingest_error: reason,
        telegram_chat_id: ctx.telegram_chat_id ?? null,
        telegram_message_id: ctx.telegram_message_id ?? null,
        telegram_update_id: ctx.telegram_update_id ?? null,
        telegram_polled: Boolean(ctx.telegram_polled),
        telegram_command: ctx.telegram_command ?? null,
        telegram_lock_acquired: Boolean(ctx.telegram_lock_acquired),
        telegram_lock_id: ctx.telegram_lock_id ?? null,
        youtube_ingest_url: ctx.youtube_ingest_url ?? null,
        telegram_document_file_id: ctx.telegram_document_file_id ?? null,
        telegram_document_filename: ctx.telegram_document_filename ?? null,
        pdf_extract_result: ctx.pdf_extract_result ?? null,
        ...notification
      },
      args.pretty
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
