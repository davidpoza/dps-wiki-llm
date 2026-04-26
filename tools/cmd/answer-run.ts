#!/usr/bin/env node

import fs from "node:fs/promises";
import path from "node:path";
import { SYSTEM_CONFIG } from "../config.js";
import { parseArgs, readJsonInput, writeJsonStdout } from "../lib/infra/cli.js";
import { resolveVaultRoot, pathExists } from "../lib/storage/fs-utils.js";
import { manifestPath } from "../lib/storage/semantic-index.js";
import { createLogger } from "../lib/infra/logger.js";
import type { LlmMeta } from "../lib/infra/llm.js";
import { chatCompletion, chatText, llmMeta } from "../lib/infra/llm.js";
import { runToolJson } from "../lib/infra/run-tool.js";
import { releaseTelegramLockAfterFailure } from "../lib/infra/telegram-lock.js";
import type {
  AnswerContextPacket,
  AnswerRecord,
  FeedbackRecord,
  SearchResult
} from "../lib/core/contracts.js";

import { isRecord, stringValue } from "../lib/core/type-guards.js";
import { answerRequest } from "../services/answers/generate-answer.js";
import { feedbackRequest, parseFeedback } from "../services/answers/propose-feedback.js";
import { buildAnswerNotification } from "../services/notifications/telegram.js";
import type { TelegramBaseFields, TelegramMessage } from "../services/notifications/telegram.js";

type AnswerRunInput = Record<string, unknown>;

type AnswerRecordResult = {
  record: AnswerRecord;
  output_path: string;
  wrote: boolean;
};

type FeedbackValidation = {
  record: FeedbackRecord;
  record_path: string;
  summary_path: string;
  mutation_plan_path: string | null;
};

type AnswerRunOutput = TelegramBaseFields & {
  status: "answer_recorded_feedback_proposed";
  question: string;
  answer: string;
  answer_record: AnswerRecord;
  answer_record_result: AnswerRecordResult;
  output_path: string;
  proposed_feedback: FeedbackRecord;
  feedback_validation: FeedbackValidation;
  approval_required: boolean;
  apply_feedback_workflow: "KB - Apply Feedback";
  approval_payload: { approved: true; feedback: FeedbackRecord };
  llm_answer_meta: LlmMeta;
  llm_feedback_meta: LlmMeta;
  retrieval: SearchResult;
  context_docs: AnswerContextPacket["context_docs"];
  telegram_chat_id: unknown;
  telegram_message_id: unknown;
  telegram_update_id: unknown;
  telegram_polled: boolean;
  telegram_command: unknown;
  telegram_lock_acquired: boolean;
  telegram_lock_id: unknown;
  telegram_answer_message: TelegramMessage | null;
};

function stripTelegramCommand(text: string): string {
  return text.replace(/^\/(?:ask|answer|query)(?:@\w+)?\s*/i, "").trim();
}

type RetrievalMode = "fts" | "semantic" | "hybrid";

function normalizeInput(input: AnswerRunInput): {
  question: string;
  limit: number;
  retrieval_mode: RetrievalMode;
  telegram_chat_id: unknown;
  telegram_message_id: unknown;
  telegram_update_id: unknown;
  telegram_polled: boolean;
  telegram_command: unknown;
  telegram_lock_acquired: boolean;
  telegram_lock_id: unknown;
} {
  const body = isRecord(input.body) ? input.body : input;
  const telegramMessage = isRecord(body.message)
    ? body.message
    : isRecord(body.edited_message)
      ? body.edited_message
      : null;
  const telegramChat = isRecord(telegramMessage?.chat) ? telegramMessage.chat : null;
  const telegramChatId =
    telegramChat?.id !== undefined ? String(telegramChat.id) : null;
  const telegramText =
    typeof telegramMessage?.text === "string" ? telegramMessage.text.trim() : "";
  const allowedTelegramChatId = String(process.env.TELEGRAM_CHAT_ID || "").trim();

  if (
    telegramChatId &&
    allowedTelegramChatId &&
    telegramChatId !== allowedTelegramChatId
  ) {
    throw new Error(`Unauthorized Telegram chat id: ${telegramChatId}`);
  }

  const bodyQuestion = stringValue(body.question);
  const question = telegramText
    ? stripTelegramCommand(telegramText)
    : bodyQuestion || SYSTEM_CONFIG.answer.defaultQuestion;

  if (telegramText && !question) {
    throw new Error("Telegram message did not include a question after the command");
  }

  const limit =
    Number.isFinite(Number(body.limit)) && Number(body.limit) > 0
      ? Number(body.limit)
      : SYSTEM_CONFIG.cli.defaultSearchLimit;

  const rawMode = typeof body.retrieval_mode === "string" ? body.retrieval_mode : "hybrid";
  const retrieval_mode: RetrievalMode =
    rawMode === "fts" || rawMode === "semantic" || rawMode === "hybrid" ? rawMode : "hybrid";

  return {
    question,
    limit,
    retrieval_mode,
    telegram_chat_id: telegramChatId,
    telegram_message_id: telegramMessage?.message_id ?? null,
    telegram_update_id: body.update_id ?? null,
    telegram_polled: Boolean(input.telegram_polled),
    telegram_command: input.telegram_command ?? null,
    telegram_lock_acquired: Boolean(input.telegram_lock_acquired),
    telegram_lock_id: input.telegram_lock_id ?? null
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
  const log = createLogger("answer-run");
  let lockContext: unknown = null;
  let answerArtifactAbsPath: string | null = null;

  log.info({ phase: "startup" }, "answer-run: started");

  try {
    // ── 1. read and normalize input ───────────────────────────────────────────

    const input = await readJsonInput<AnswerRunInput>(args.input);
    lockContext = input;

    const normalized = normalizeInput(input);
    lockContext = normalized;

    log.info(
      {
        phase: "normalize-input",
        question_length: normalized.question.length,
        question_preview: normalized.question.slice(0, 80),
        limit: normalized.limit,
        telegram_chat_id: normalized.telegram_chat_id,
        telegram_command: normalized.telegram_command
      },
      "answer-run: [normalize-input] input normalized"
    );

    // ── 2. search wiki ────────────────────────────────────────────────────────

    const vaultRoot = resolveVaultRoot(args.vault);
    const hasSemanticIndex = await pathExists(manifestPath(vaultRoot));
    const resolvedMode =
      normalized.retrieval_mode === "hybrid" || normalized.retrieval_mode === "semantic"
        ? hasSemanticIndex
          ? normalized.retrieval_mode
          : "fts"
        : "fts";

    log.info(
      {
        phase: "search",
        question_length: normalized.question.length,
        limit: normalized.limit,
        retrieval_mode: resolvedMode,
        has_semantic_index: hasSemanticIndex
      },
      "answer-run: [search] querying wiki for relevant documents"
    );

    const searchTool =
      resolvedMode === "hybrid"
        ? "hybrid-search"
        : resolvedMode === "semantic"
          ? "semantic-search"
          : "search";

    const retrieval = await runToolJson<SearchResult>(searchTool, {
      vault: args.vault,
      args: ["--limit", String(normalized.limit), normalized.question]
    });

    log.info(
      {
        phase: "search",
        results: retrieval.results?.length ?? 0,
        top_result: retrieval.results?.[0]?.path ?? null,
        top_score: retrieval.results?.[0]?.score ?? null,
        retrieval_mode: resolvedMode
      },
      "answer-run: [search] wiki search completed"
    );

    // ── 3. build answer context ───────────────────────────────────────────────

    log.info(
      { phase: "answer-context", search_results: retrieval.results?.length ?? 0 },
      "answer-run: [answer-context] building answer context packet"
    );

    const context = await runToolJson<AnswerContextPacket>("answer-context", {
      vault: args.vault,
      input: { question: normalized.question, retrieval }
    });

    log.info(
      {
        phase: "answer-context",
        context_docs: context.context_docs?.length ?? 0,
        evidence_used: context.answer_record?.evidence_used?.length ?? 0
      },
      "answer-run: [answer-context] context packet ready"
    );

    // ── 4. LLM: generate answer ───────────────────────────────────────────────

    log.info(
      {
        phase: "generate-answer/llm",
        question_length: normalized.question.length,
        context_docs: context.context_docs?.length ?? 0
      },
      "answer-run: [generate-answer/llm] requesting answer from LLM"
    );

    const answerResponse = await chatCompletion(answerRequest(context));
    const answer = chatText(answerResponse, "LLM answer");
    const answerMeta = llmMeta(answerResponse);

    log.info(
      {
        phase: "generate-answer/llm",
        model: answerMeta.model,
        finish_reason: answerMeta.finish_reason,
        answer_length: answer.length,
        ...usageSummary(answerMeta)
      },
      "answer-run: [generate-answer/llm] answer received"
    );

    // ── 5. record answer ──────────────────────────────────────────────────────

    log.info(
      {
        phase: "answer-record",
        output_id: context.answer_record?.output_id,
        question_length: normalized.question.length
      },
      "answer-run: [answer-record] persisting answer artifact"
    );

    const answerRecordResult = await runToolJson<AnswerRecordResult>("answer-record", {
      vault: args.vault,
      input: { answer_record: context.answer_record, answer }
    });
    const answerRecord = answerRecordResult.record;

    if (answerRecordResult.wrote && answerRecordResult.output_path) {
      answerArtifactAbsPath = path.join(resolveVaultRoot(args.vault), answerRecordResult.output_path);
    }

    log.info(
      {
        phase: "answer-record",
        output_id: answerRecord.output_id,
        output_path: answerRecordResult.output_path,
        wrote: answerRecordResult.wrote
      },
      "answer-run: [answer-record] answer artifact written"
    );

    // ── 6. LLM: propose feedback ──────────────────────────────────────────────

    log.info(
      {
        phase: "propose-feedback/llm",
        output_id: answerRecord.output_id,
        evidence_used: countOf(answerRecord.evidence_used)
      },
      "answer-run: [propose-feedback/llm] requesting feedback proposal from LLM"
    );

    const feedbackResponse = await chatCompletion(
      feedbackRequest(context, answer, answerRecord)
    );
    const proposedFeedback = parseFeedback(feedbackResponse, answerRecord);
    const feedbackMeta = llmMeta(feedbackResponse);

    log.info(
      {
        phase: "propose-feedback/llm",
        model: feedbackMeta.model,
        finish_reason: feedbackMeta.finish_reason,
        decision: proposedFeedback.decision,
        candidates: countOf(proposedFeedback.candidate_items),
        affected_notes: countOf(proposedFeedback.affected_notes),
        ...usageSummary(feedbackMeta)
      },
      "answer-run: [propose-feedback/llm] feedback proposal received"
    );

    // ── 7. validate and record feedback ──────────────────────────────────────

    log.info(
      {
        phase: "feedback-record",
        output_id: answerRecord.output_id,
        decision: proposedFeedback.decision
      },
      "answer-run: [feedback-record] validating feedback record (dry-run)"
    );

    const feedbackValidation = await runToolJson<FeedbackValidation>(
      "feedback-record",
      { vault: args.vault, input: proposedFeedback, write: false }
    );
    const feedback = feedbackValidation.record;

    log.info(
      {
        phase: "feedback-record",
        decision: feedback.decision,
        record_path: feedbackValidation.record_path
      },
      "answer-run: [feedback-record] feedback record validated"
    );

    // ── 8. build output ───────────────────────────────────────────────────────

    const approvalRequired = feedback.decision === "propagate";
    const notification = buildAnswerNotification({
      telegram_chat_id: normalized.telegram_chat_id,
      question: normalized.question,
      answer,
      output_path: answerRecordResult.output_path,
      evidence_used: Array.isArray(answerRecord.evidence_used)
        ? answerRecord.evidence_used
        : [],
      feedback_decision: feedback.decision ?? "unknown",
      approval_required: approvalRequired
    });

    const output: AnswerRunOutput = {
      status: "answer_recorded_feedback_proposed",
      question: normalized.question,
      answer,
      answer_record: answerRecord,
      answer_record_result: answerRecordResult,
      output_path: answerRecordResult.output_path,
      proposed_feedback: feedback,
      feedback_validation: feedbackValidation,
      approval_required: approvalRequired,
      apply_feedback_workflow: "KB - Apply Feedback",
      approval_payload: { approved: true, feedback },
      llm_answer_meta: answerMeta,
      llm_feedback_meta: feedbackMeta,
      retrieval,
      context_docs: context.context_docs,
      telegram_chat_id: normalized.telegram_chat_id,
      telegram_message_id: normalized.telegram_message_id,
      telegram_update_id: normalized.telegram_update_id,
      telegram_polled: normalized.telegram_polled,
      telegram_command: normalized.telegram_command,
      telegram_lock_acquired: normalized.telegram_lock_acquired,
      telegram_lock_id: normalized.telegram_lock_id,
      ...notification
    };

    log.info(
      {
        phase: "done",
        output_id: answerRecord.output_id,
        output_path: answerRecordResult.output_path,
        feedback_decision: feedback.decision,
        approval_required: approvalRequired,
        answer_length: answer.length,
        evidence_used: countOf(answerRecord.evidence_used)
      },
      "answer-run: completed"
    );

    writeJsonStdout(output, args.pretty);
  } catch (error) {
    log.error(
      {
        phase: "error",
        err: error instanceof Error ? error.message : String(error)
      },
      "answer-run: pipeline failed — rolling back and releasing lock"
    );

    if (answerArtifactAbsPath) {
      try {
        await fs.unlink(answerArtifactAbsPath);
        log.info({ path: answerArtifactAbsPath }, "answer-run: rollback — answer artifact deleted");
      } catch (unlinkErr) {
        log.error(
          { path: answerArtifactAbsPath, err: unlinkErr instanceof Error ? unlinkErr.message : String(unlinkErr) },
          "answer-run: rollback — failed to delete answer artifact"
        );
      }
    }

    await releaseTelegramLockAfterFailure(args.vault, lockContext, "answer-run");
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
