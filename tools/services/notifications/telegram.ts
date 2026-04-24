import type { MutationResult } from "../../lib/core/contracts.js";
import { truncateText } from "../../lib/infra/text.js";

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

// ─── Health check ─────────────────────────────────────────────────────────────

export type HealthCheckNotificationParams = {
  run_id: string;
  stats: { docs: number; findings: number; critical: number; warning: number; suggestion: number };
  missing_pages: number;
  broken_links: number;
  link_resolutions: number;
  pruned_links: number;
  discovered_links: number;
  applied_new_links: number;
  top_critical_findings: Array<{ path: string; issue_type: string }>;
  report_path?: string | null;
};

export function buildHealthCheckNotification(
  params: HealthCheckNotificationParams
): TelegramBaseFields & { telegram_health_check_message: TelegramMessage | null } {
  const { token, chatId, missingConfig } = resolveTelegramConfig(null);
  const criticalLines = params.top_critical_findings.slice(0, 5).map(
    (f) => `  ${f.path} — ${f.issue_type}`
  );
  const text = compactLines([
    "KB Health Check completado",
    `Run: ${params.run_id}`,
    `Docs escaneados: ${params.stats.docs}`,
    `Findings: ${params.stats.findings} (critical: ${params.stats.critical}, warning: ${params.stats.warning}, suggestion: ${params.stats.suggestion})`,
    `Missing pages: ${params.missing_pages}`,
    `Links rotos reportados: ${params.broken_links}`,
    `Sugerencias para links rotos: ${params.link_resolutions}`,
    params.pruned_links > 0 ? `Links eliminados (irrelevantes): ${params.pruned_links}` : "",
    `Links nuevos descubiertos: ${params.discovered_links}`,
    params.applied_new_links > 0 ? `Links nuevos aplicados: ${params.applied_new_links}` : "",
    params.stats.critical > 0 ? "Issues críticos:" : "",
    ...criticalLines,
    params.report_path ? `Reporte: ${params.report_path}` : ""
  ]);
  const msg = makeMessage(missingConfig, chatId, text);
  return { ...baseFields(missingConfig, token, msg), telegram_health_check_message: msg };
}

// ─── Search results ───────────────────────────────────────────────────────────

export type SearchNotificationParams = {
  telegram_chat_id: unknown;
  query: string;
  retrieval: {
    mode?: string;
    results: Array<{ path: string; title: string; doc_type: string; score: number }>;
  };
};

export function buildSearchNotification(
  params: SearchNotificationParams
): TelegramBaseFields & { telegram_search_message: TelegramMessage | null } {
  const { token, chatId, missingConfig } = resolveTelegramConfig(params.telegram_chat_id);
  const results = Array.isArray(params.retrieval.results) ? params.retrieval.results : [];
  const resultLines = results.slice(0, 10).map((r, i) => {
    const score = typeof r.score === "number" ? r.score.toFixed(3) : "?";
    return `${i + 1}. ${r.title || r.path} [${r.doc_type}] (${score})\n   ${r.path}`;
  });
  const text = compactLines([
    "KB search completed",
    `Query: ${truncateText(params.query, 300)}`,
    params.retrieval.mode ? `Mode: ${params.retrieval.mode}` : "",
    `Results: ${results.length}`,
    ...resultLines
  ]);
  const msg = makeMessage(missingConfig, chatId, text);
  return { ...baseFields(missingConfig, token, msg), telegram_search_message: msg };
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
