#!/usr/bin/env node

import { SYSTEM_CONFIG } from "./config.js";
import { parseArgs, readJsonInput, writeJsonStdout } from "./lib/cli.js";
import type { AnswerContextPacket, AnswerRecord, FeedbackRecord, SearchResult } from "./lib/contracts.js";
import type { ChatCompletionRequest, ChatCompletionResponse, LlmMeta } from "./lib/llm.js";
import { answerTemperature, chatCompletion, chatText, extractJson, llmMeta } from "./lib/llm.js";
import { runToolJson } from "./lib/run-tool.js";

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

type TelegramMessage = {
  chat_id: string;
  text: string;
  disable_web_page_preview: boolean;
};

type AnswerRunOutput = {
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
  approval_payload: {
    approved: true;
    feedback: FeedbackRecord;
  };
  openrouter_answer_meta: LlmMeta;
  openrouter_feedback_meta: LlmMeta;
  retrieval: SearchResult;
  context_docs: AnswerContextPacket["context_docs"];
  telegram_chat_id: unknown;
  telegram_message_id: unknown;
  telegram_update_id: unknown;
  telegram_polled: boolean;
  telegram_command: unknown;
  telegram_lock_acquired: boolean;
  telegram_lock_id: unknown;
  telegram_enabled: boolean;
  telegram_skip_reason: string | null;
  telegram_bot_token: string;
  telegram_message: TelegramMessage | null;
  telegram_answer_message: TelegramMessage | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stripTelegramCommand(text: string): string {
  return text.replace(/^\/(?:ask|answer|query)(?:@\w+)?\s*/i, "").trim();
}

function normalizeInput(input: AnswerRunInput): {
  question: string;
  limit: number;
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
  const telegramChatId = telegramChat?.id !== undefined ? String(telegramChat.id) : null;
  const telegramText = typeof telegramMessage?.text === "string" ? telegramMessage.text.trim() : "";
  const allowedTelegramChatId = String(process.env.TELEGRAM_CHAT_ID || "").trim();

  if (telegramChatId && allowedTelegramChatId && telegramChatId !== allowedTelegramChatId) {
    throw new Error(`Unauthorized Telegram chat id: ${telegramChatId}`);
  }

  const bodyQuestion = stringValue(body.question);
  const question = telegramText
    ? stripTelegramCommand(telegramText)
    : bodyQuestion || SYSTEM_CONFIG.answer.defaultQuestion;

  if (telegramText && !question) {
    throw new Error("Telegram message did not include a question after the command");
  }

  const limit = Number.isFinite(Number(body.limit)) && Number(body.limit) > 0 ? Number(body.limit) : SYSTEM_CONFIG.cli.defaultSearchLimit;

  return {
    question,
    limit,
    telegram_chat_id: telegramChatId,
    telegram_message_id: telegramMessage?.message_id ?? null,
    telegram_update_id: body.update_id ?? null,
    telegram_polled: Boolean(input.telegram_polled),
    telegram_command: input.telegram_command ?? null,
    telegram_lock_acquired: Boolean(input.telegram_lock_acquired),
    telegram_lock_id: input.telegram_lock_id ?? null
  };
}

function answerRequest(packet: AnswerContextPacket): ChatCompletionRequest {
  const contextDocs = Array.isArray(packet.context_docs) ? packet.context_docs : [];
  return {
    stream: false,
    temperature: answerTemperature(),
    messages: [
      {
        role: "system",
        content: [
          "You answer questions using only the provided markdown wiki context.",
          "If the context is insufficient, say what is missing instead of inventing facts.",
          "Do not mutate the wiki and do not claim to have updated files.",
          "Return concise markdown suitable for an answer artifact."
        ].join(" ")
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            question: packet.question,
            evidence_used: packet.answer_record?.evidence_used ?? [],
            context_docs: contextDocs.map((doc) => ({
              path: doc.path,
              title: doc.title,
              doc_type: doc.doc_type,
              body: doc.body
            }))
          },
          null,
          2
        )
      }
    ]
  };
}

function feedbackRequest(packet: AnswerContextPacket, answer: string, answerRecord: AnswerRecord): ChatCompletionRequest {
  const contextDocs = Array.isArray(packet.context_docs) ? packet.context_docs : [];
  return {
    stream: false,
    temperature: 0,
    messages: [
      {
        role: "system",
        content: [
          "You produce only valid JSON matching the Feedback Record contract.",
          "Valid decision values are none, output_only, and propagate.",
          "Use propagate only for small reusable wiki changes grounded in the evidence_used paths.",
          "Every candidate item must include item_id, target_note, change_type, novelty, source_support, proposed_content, and outcome.",
          "Use outcome applied only for changes you recommend a human approve; otherwise use deferred or rejected.",
          "Do not copy the whole answer into the wiki."
        ].join(" ")
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            output_id: answerRecord.output_id,
            answer_record: answerRecord,
            answer,
            source_refs: answerRecord.evidence_used ?? [],
            context_docs: contextDocs.map((doc) => ({
              path: doc.path,
              title: doc.title,
              doc_type: doc.doc_type,
              body: doc.body
            })),
            required_json_shape: {
              output_id: answerRecord.output_id,
              decision: "none|output_only|propagate",
              reason: "short reason",
              source_refs: answerRecord.evidence_used ?? [],
              candidate_items: [],
              affected_notes: []
            }
          },
          null,
          2
        )
      }
    ]
  };
}

function parseFeedback(response: ChatCompletionResponse, answerRecord: AnswerRecord): FeedbackRecord {
  const proposed = extractJson(chatText(response, "OpenRouter feedback"));
  if (!isRecord(proposed)) {
    throw new Error("OpenRouter feedback response must be a JSON object");
  }
  if (!proposed.output_id) {
    proposed.output_id = answerRecord.output_id;
  }
  if (!Array.isArray(proposed.source_refs)) {
    proposed.source_refs = answerRecord.evidence_used ?? [];
  }
  if (!Array.isArray(proposed.candidate_items)) {
    proposed.candidate_items = [];
  }
  if (!Array.isArray(proposed.affected_notes)) {
    const candidateItems = proposed.candidate_items as unknown[];
    proposed.affected_notes = candidateItems
      .filter((item) => isRecord(item) && item.outcome === "applied")
      .map((item) => (isRecord(item) ? item.target_note : null))
      .filter((item): item is string => typeof item === "string" && Boolean(item.trim()));
  }
  return proposed as unknown as FeedbackRecord;
}

function truncate(value: unknown, maxLength: number): string {
  const text = String(value ?? "");
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function compactLines(values: unknown[]): string {
  return values.filter((value) => typeof value === "string" && value.trim()).join(String.fromCharCode(10));
}

function buildTelegramFields(output: Omit<AnswerRunOutput, "telegram_enabled" | "telegram_skip_reason" | "telegram_bot_token" | "telegram_message" | "telegram_answer_message">): Pick<
  AnswerRunOutput,
  "telegram_enabled" | "telegram_skip_reason" | "telegram_bot_token" | "telegram_message" | "telegram_answer_message"
> {
  const chatId = String(output.telegram_chat_id ?? process.env.TELEGRAM_CHAT_ID ?? "").trim();
  const token = String(process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  const missingConfig: string[] = [];
  if (!token) missingConfig.push("TELEGRAM_BOT_TOKEN");
  if (!chatId) missingConfig.push("telegram_chat_id or TELEGRAM_CHAT_ID");
  const evidence = Array.isArray(output.answer_record?.evidence_used) ? output.answer_record.evidence_used : [];
  const text = compactLines([
    "KB answer completed",
    `Question: ${truncate(output.question, 500)}`,
    "Answer:",
    truncate(output.answer, 2600),
    output.output_path ? `Output: ${output.output_path}` : "",
    evidence.length ? `Evidence: ${evidence.slice(0, 6).join(", ")}` : "",
    `Feedback decision: ${output.proposed_feedback?.decision ?? "unknown"}`,
    output.approval_required ? "Feedback approval required: yes" : "Feedback approval required: no"
  ]);

  const telegramMessage = missingConfig.length
    ? null
    : {
        chat_id: chatId,
        text,
        disable_web_page_preview: true
      };

  return {
    telegram_enabled: missingConfig.length === 0,
    telegram_skip_reason: missingConfig.length ? `Missing Telegram runtime configuration: ${missingConfig.join(", ")}` : null,
    telegram_bot_token: token,
    telegram_message: telegramMessage,
    telegram_answer_message: telegramMessage
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const normalized = normalizeInput(await readJsonInput<AnswerRunInput>(args.input));
  const retrieval = await runToolJson<SearchResult>("search", {
    vault: args.vault,
    args: ["--limit", String(normalized.limit), normalized.question]
  });
  const context = await runToolJson<AnswerContextPacket>("answer-context", {
    vault: args.vault,
    input: {
      question: normalized.question,
      retrieval
    }
  });
  const answerResponse = await chatCompletion(answerRequest(context));
  const answer = chatText(answerResponse, "OpenRouter answer");
  const answerRecordResult = await runToolJson<AnswerRecordResult>("answer-record", {
    vault: args.vault,
    input: {
      answer_record: context.answer_record,
      answer
    }
  });
  const answerRecord = answerRecordResult.record;
  const feedbackResponse = await chatCompletion(feedbackRequest(context, answer, answerRecord));
  const proposedFeedback = parseFeedback(feedbackResponse, answerRecord);
  const feedbackValidation = await runToolJson<FeedbackValidation>("feedback-record", {
    vault: args.vault,
    input: proposedFeedback,
    write: false
  });
  const feedback = feedbackValidation.record;
  const outputBase: Omit<AnswerRunOutput, "telegram_enabled" | "telegram_skip_reason" | "telegram_bot_token" | "telegram_message" | "telegram_answer_message"> = {
    status: "answer_recorded_feedback_proposed",
    question: normalized.question,
    answer,
    answer_record: answerRecord,
    answer_record_result: answerRecordResult,
    output_path: answerRecordResult.output_path,
    proposed_feedback: feedback,
    feedback_validation: feedbackValidation,
    approval_required: feedback.decision === "propagate",
    apply_feedback_workflow: "KB - Apply Feedback",
    approval_payload: {
      approved: true,
      feedback
    },
    openrouter_answer_meta: llmMeta(answerResponse),
    openrouter_feedback_meta: llmMeta(feedbackResponse),
    retrieval,
    context_docs: context.context_docs,
    telegram_chat_id: normalized.telegram_chat_id,
    telegram_message_id: normalized.telegram_message_id,
    telegram_update_id: normalized.telegram_update_id,
    telegram_polled: normalized.telegram_polled,
    telegram_command: normalized.telegram_command,
    telegram_lock_acquired: normalized.telegram_lock_acquired,
    telegram_lock_id: normalized.telegram_lock_id
  };

  writeJsonStdout({ ...outputBase, ...buildTelegramFields(outputBase) }, args.pretty);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
