#!/usr/bin/env node

import { parseArgs, readJsonInput, writeJsonStdout } from "./lib/cli.js";
import { createLogger } from "./lib/logger.js";
import { resolveVaultRoot, pathExists } from "./lib/fs-utils.js";
import { manifestPath } from "./lib/semantic-index.js";
import type { LlmMeta } from "./lib/llm.js";
import { chatCompletion, llmMeta } from "./lib/llm.js";
import { runToolJson } from "./lib/run-tool.js";
import { releaseTelegramLockAfterFailure } from "./lib/telegram-lock.js";
import type {
  AnswerContextPacket,
  CommitInput,
  MutationPlan,
  MutationResult,
  NormalizedSourcePayload,
  SearchResult
} from "./lib/contracts.js";

import {
  normalizeRawEvent,
  ensureRawEvent
} from "./services/ingest/normalize-event.js";
import type { IngestRawEvent } from "./services/ingest/normalize-event.js";
import { sourceNoteRequest, parseSourceNote } from "./services/ingest/build-source-note.js";
import {
  buildWikiContextQuery,
  ingestPlanRequest
} from "./services/ingest/build-llm-plan.js";
import { parseAndGuardrailPlan } from "./services/ingest/guardrail-plan.js";
import type { GuardrailRejection } from "./services/ingest/guardrail-plan.js";
import {
  buildIngestNotification,
  buildIngestFailureNotification
} from "./services/notifications/telegram.js";
import type {
  TelegramBaseFields,
  TelegramMessage
} from "./services/notifications/telegram.js";

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
  telegram_ingest_message: TelegramMessage | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function unique(values: Array<string | null | undefined>): string[] {
  return [
    ...new Set(
      values.filter((item): item is string => typeof item === "string" && Boolean(item.trim()))
    )
  ];
}

function truncate(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
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
    commit_message: `ingest: apply LLM plan for ${truncate(title, 60)}`
  };
}

function countOf(values: unknown): number {
  return Array.isArray(values) ? values.length : 0;
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

async function main(): Promise<void> {
  const args = parseArgs();
  const log = createLogger("ingest-run");
  let lockContext: unknown = null;

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

    // ── 6. apply baseline ─────────────────────────────────────────────────────

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
    const vaultRoot = resolveVaultRoot(args.vault);
    const hasSemanticIndex = await pathExists(manifestPath(vaultRoot));
    const wikiContextSearchTool = hasSemanticIndex ? "hybrid-search" : "search";

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

    const [generalRetrieval, topicRetrieval] = await Promise.all([
      runToolJson<SearchResult>(wikiContextSearchTool, {
        vault: args.vault,
        args: ["--limit", String(INGEST_WIKI_CONTEXT_LIMIT), wikiContextQuery]
      }),
      runToolJson<SearchResult>(wikiContextSearchTool, {
        vault: args.vault,
        args: ["--limit", String(INGEST_TOPIC_CONTEXT_LIMIT), "--doc-type", "topic", wikiContextQuery]
      })
    ]);

    // Merge: topics fill guaranteed slots; general results deduplicated against them.
    const seenPaths = new Set(topicRetrieval.results.map((r) => r.path));
    const mergedResults = [
      ...topicRetrieval.results,
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
        topic_results: topicRetrieval.results.length,
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
    const ingestPlanResponse = await chatCompletion(ingestPlanReqBody);
    const ingestPlanMeta = llmMeta(ingestPlanResponse);

    log.info(
      {
        phase: "ingest-plan/llm",
        model: ingestPlanMeta.model,
        finish_reason: ingestPlanMeta.finish_reason,
        ...usageSummary(ingestPlanMeta)
      },
      "ingest-run: [ingest-plan/llm] LLM plan response received"
    );

    // ── 11. guardrail plan ────────────────────────────────────────────────────

    log.info(
      { phase: "guardrail-plan" },
      "ingest-run: [guardrail-plan] validating LLM plan"
    );

    const { plan: llmMutationPlan, rejections, hasChanges } = parseAndGuardrailPlan(
      ingestPlanResponse,
      baselinePlanOutput.mutation_plan,
      wikiContext.context_docs,
      log
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

    // ── 14. gen-home ─────────────────────────────────────────────────────────

    log.info({ phase: "gen-home" }, "ingest-run: [gen-home] regenerating HOME.md");

    await runToolJson<Record<string, unknown>>("gen-home", {
      vault: args.vault
    });

    log.info({ phase: "gen-home" }, "ingest-run: [gen-home] HOME.md updated");

    // ── 15. build output ──────────────────────────────────────────────────────

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
        embed_indexed: embedIndexResult.embedded ?? null
      },
      "ingest-run: completed"
    );

    writeJsonStdout(output, args.pretty);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);

    log.error(
      { phase: "error", err: reason },
      "ingest-run: pipeline failed — writing structured failure output and releasing lock"
    );

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
