import type { MutationResult } from "../../lib/contracts.js";
import { truncateText } from "../../lib/text.js";

export type TelegramMessage = {
  chat_id: string;
  text: string;
  disable_web_page_preview: boolean;
};

export type TelegramBaseFields = {
  telegram_enabled: boolean;
  telegram_skip_reason: string | null;
  telegram_bot_token: string;
  telegram_message: TelegramMessage | null;
};

export function resolveTelegramConfig(chatIdValue: unknown): {
  token: string;
  chatId: string;
  missingConfig: string[];
} {
  const chatId = String(chatIdValue ?? process.env.TELEGRAM_CHAT_ID ?? "").trim();
  const token = String(process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  const missingConfig: string[] = [];
  if (!token) missingConfig.push("TELEGRAM_BOT_TOKEN");
  if (!chatId) missingConfig.push("telegram_chat_id or TELEGRAM_CHAT_ID");
  return { token, chatId, missingConfig };
}

function compactLines(values: unknown[]): string {
  return values.filter((v) => typeof v === "string" && (v as string).trim()).join("\n");
}

function countOf(values: unknown): number {
  return Array.isArray(values) ? values.length : 0;
}

function makeMessage(missingConfig: string[], chatId: string, text: string): TelegramMessage | null {
  return missingConfig.length ? null : { chat_id: chatId, text, disable_web_page_preview: true };
}

function baseFields(
  missingConfig: string[],
  token: string,
  message: TelegramMessage | null
): TelegramBaseFields {
  return {
    telegram_enabled: missingConfig.length === 0,
    telegram_skip_reason: missingConfig.length
      ? `Missing Telegram runtime configuration: ${missingConfig.join(", ")}`
      : null,
    telegram_bot_token: token,
    telegram_message: message
  };
}

// ─── Ingest success ───────────────────────────────────────────────────────────

export type IngestNotificationParams = {
  telegram_chat_id: unknown;
  status: string;
  source_title: string;
  source_id: string;
  raw_path?: string | null;
  baseline_mutation_result: Pick<MutationResult, "created" | "updated" | "skipped">;
  llm_mutation_result: Pick<MutationResult, "created" | "updated" | "skipped"> | null;
  guardrail_rejections: number;
  baseline_commit_sha?: string | null;
  llm_commit_sha?: string | null;
};

export function buildIngestNotification(
  params: IngestNotificationParams
): TelegramBaseFields & { telegram_ingest_message: TelegramMessage | null } {
  const { token, chatId, missingConfig } = resolveTelegramConfig(params.telegram_chat_id);
  const b = params.baseline_mutation_result;
  const l = params.llm_mutation_result;
  const text = compactLines([
    "KB ingest completed",
    `Status: ${params.status}`,
    `Source: ${truncateText(params.source_title || params.source_id || "unknown", 500)}`,
    params.raw_path ? `Raw: ${params.raw_path}` : "",
    `Baseline created/updated/skipped: ${countOf(b.created)}/${countOf(b.updated)}/${countOf(b.skipped)}`,
    l
      ? `LLM created/updated/skipped: ${countOf(l.created)}/${countOf(l.updated)}/${countOf(l.skipped)}`
      : "LLM changes: none",
    params.guardrail_rejections ? `Guardrail rejections: ${params.guardrail_rejections}` : "",
    params.baseline_commit_sha ? `Baseline commit: ${params.baseline_commit_sha}` : "",
    params.llm_commit_sha ? `LLM commit: ${params.llm_commit_sha}` : ""
  ]);
  const msg = makeMessage(missingConfig, chatId, text);
  return { ...baseFields(missingConfig, token, msg), telegram_ingest_message: msg };
}

// ─── Ingest failure ───────────────────────────────────────────────────────────

export type IngestFailureNotificationParams = {
  telegram_chat_id: unknown;
  youtube_ingest_url?: string | null;
  reason: string;
  youtube_video_id?: string | null;
};

export function buildIngestFailureNotification(
  params: IngestFailureNotificationParams
): TelegramBaseFields & { telegram_ingest_failure_message: TelegramMessage | null } {
  const { token, chatId, missingConfig } = resolveTelegramConfig(params.telegram_chat_id);
  const text = compactLines([
    "KB ingest failed",
    "Command: /ingest",
    params.youtube_ingest_url
      ? `URL: ${truncateText(params.youtube_ingest_url, 500)}`
      : "",
    `Reason: ${truncateText(params.reason, 1000)}`,
    params.youtube_video_id ? `YouTube video ID: ${params.youtube_video_id}` : ""
  ]);
  const msg = makeMessage(missingConfig, chatId, text);
  return { ...baseFields(missingConfig, token, msg), telegram_ingest_failure_message: msg };
}

// ─── Answer success ───────────────────────────────────────────────────────────

export type AnswerNotificationParams = {
  telegram_chat_id: unknown;
  question: string;
  answer: string;
  output_path: string;
  evidence_used: string[];
  feedback_decision: string;
  approval_required: boolean;
};

export function buildAnswerNotification(
  params: AnswerNotificationParams
): TelegramBaseFields & { telegram_answer_message: TelegramMessage | null } {
  const { token, chatId, missingConfig } = resolveTelegramConfig(params.telegram_chat_id);
  const text = compactLines([
    "KB answer completed",
    `Question: ${truncateText(params.question, 500)}`,
    "Answer:",
    truncateText(params.answer, 2600),
    params.output_path ? `Output: ${params.output_path}` : "",
    params.evidence_used.length
      ? `Evidence: ${params.evidence_used.slice(0, 6).join(", ")}`
      : "",
    `Feedback decision: ${params.feedback_decision ?? "unknown"}`,
    params.approval_required
      ? "Feedback approval required: yes"
      : "Feedback approval required: no"
  ]);
  const msg = makeMessage(missingConfig, chatId, text);
  return { ...baseFields(missingConfig, token, msg), telegram_answer_message: msg };
}
