#!/usr/bin/env node

import { parseArgs, readJsonInput, writeJsonStdout } from "./lib/cli.js";
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  LlmMeta
} from "./lib/llm.js";
import { chatCompletion, chatText, extractJson, llmMeta } from "./lib/llm.js";
import { runToolJson } from "./lib/run-tool.js";
import type { CommitInput, LlmSourceNote, MutationPlan, MutationResult, NormalizedSourcePayload } from "./lib/contracts.js";

type IngestRunInput = Record<string, unknown>;

type ToolPlanOutput = {
  source_payload: NormalizedSourcePayload;
  mutation_plan: MutationPlan;
  commit_input: CommitInput;
};

type CommitResult = Record<string, unknown>;

type ReindexResult = Record<string, unknown>;

type GuardrailRejection = {
  path: string | null;
  action: string | null;
  reason: string;
};

type TelegramMessage = {
  chat_id: string;
  text: string;
  disable_web_page_preview: boolean;
};

type IngestRunOutput = {
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
  telegram_enabled: boolean;
  telegram_skip_reason: string | null;
  telegram_bot_token: string;
  telegram_message: TelegramMessage | null;
  telegram_ingest_message: TelegramMessage | null;
};

const ALLOWED_PAGE_PREFIXES = ["wiki/concepts/", "wiki/entities/", "wiki/topics/", "wiki/analyses/"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function telegramMessageFromBody(body: Record<string, unknown>): Record<string, unknown> | null {
  return isRecord(body.message) ? body.message : isRecord(body.edited_message) ? body.edited_message : null;
}

function telegramCommandFromText(text: string): string | undefined {
  const match = text.match(/^\/(\w+)(?:@\w+)?(?:\s|$)/);
  return match ? match[1].toLowerCase() : undefined;
}

function telegramIngestUrlFromText(text: string): string | undefined {
  const match = text.match(/^\/ingest(?:@\w+)?(?:\s+(.+))?$/i);
  const rest = match?.[1]?.trim();
  return rest ? rest.split(/\s+/)[0] : undefined;
}

function normalizeRawEvent(input: IngestRunInput): IngestRunInput {
  const body = isRecord(input.body) ? input.body : input;
  const telegramMessage = telegramMessageFromBody(body);
  const telegramChat = isRecord(telegramMessage?.chat) ? telegramMessage.chat : null;
  const telegramChatId = telegramChat?.id !== undefined ? String(telegramChat.id) : null;
  const telegramText = typeof telegramMessage?.text === "string" ? telegramMessage.text.trim() : "";
  const allowedTelegramChatId = String(process.env.TELEGRAM_CHAT_ID || "").trim();

  if (telegramChatId && allowedTelegramChatId && telegramChatId !== allowedTelegramChatId) {
    throw new Error(`Unauthorized Telegram chat id: ${telegramChatId}`);
  }

  const explicitRawPath =
    stringValue(body.raw_path) || stringValue(body.path) || stringValue(body.filePath) || stringValue(body.filename);
  const youtubeUrl =
    stringValue(body.youtube_ingest_url) ||
    stringValue(body.youtube_url) ||
    stringValue(body.url) ||
    telegramIngestUrlFromText(telegramText);
  const telegramCommand =
    stringValue(input.telegram_command) || stringValue(body.telegram_command) || telegramCommandFromText(telegramText) || null;

  return {
    ...(explicitRawPath ? { raw_path: explicitRawPath } : {}),
    trigger_source:
      stringValue(body.trigger_source) ||
      (stringValue(body.path) || stringValue(body.filePath) || stringValue(body.filename)
        ? "local-file-trigger"
        : telegramMessage
          ? "telegram"
          : "manual"),
    captured_at: stringValue(body.captured_at) || new Date().toISOString(),
    telegram_chat_id: body.telegram_chat_id ?? telegramChatId,
    telegram_message_id: body.telegram_message_id ?? telegramMessage?.message_id ?? null,
    telegram_update_id: body.telegram_update_id ?? body.update_id ?? null,
    telegram_polled: Boolean(input.telegram_polled ?? body.telegram_polled),
    telegram_command: telegramCommand,
    telegram_lock_acquired: Boolean(input.telegram_lock_acquired ?? body.telegram_lock_acquired),
    telegram_lock_id: input.telegram_lock_id ?? body.telegram_lock_id ?? null,
    youtube_ingest_url: youtubeUrl ?? null,
    youtube_transcript_result: body.youtube_transcript_result ?? null
  };
}

function sourceNoteRequest(sourcePayload: NormalizedSourcePayload): ChatCompletionRequest {
  return {
    stream: false,
    temperature: 0,
    messages: [
      {
        role: "system",
        content: [
          "You produce only valid JSON for a cleaned source note.",
          "Clean and normalize the source content without losing materially useful information.",
          "Do not invent facts, links, names, dates, numbers, or claims not present in the source.",
          "Remove only boilerplate, navigation, ads, duplicated text, formatting noise, and irrelevant wrapper text.",
          "Do not propose wiki mutations. This step only prepares the wiki/sources note content.",
          "Return a JSON object with summary, raw_context, extracted_claims, and open_questions."
        ].join(" ")
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            source_payload: sourcePayload,
            required_json_shape: {
              summary: "Faithful concise summary of the source.",
              raw_context: "Cleaned normalized source content preserving all materially useful information.",
              extracted_claims: ["Grounded claim from the source."],
              open_questions: ["Optional unresolved ambiguity from the source."]
            },
            constraints: [
              "Preserve concrete names, dates, numbers, URLs, tool names, decisions, and caveats from the source.",
              "Use extracted_claims only for claims directly supported by the source.",
              "Use open_questions only for unresolved gaps present in or implied by the source.",
              "If the source is thin, keep raw_context short but still faithful."
            ]
          },
          null,
          2
        )
      }
    ]
  };
}

function stringArrayField(record: Record<string, unknown>, field: string, required: boolean): string[] {
  const value = record[field];
  if (value === undefined && !required) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error(`LLM source note must include ${field}[]`);
  }
  if (value.some((item) => typeof item !== "string")) {
    throw new Error(`LLM source note ${field}[] must contain only strings`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

function stringField(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`LLM source note must include non-empty ${field}`);
  }
  return value.trim();
}

function parseSourceNote(response: ChatCompletionResponse, request: ChatCompletionRequest): LlmSourceNote {
  const proposed = extractJson(chatText(response, "LLM source note"));
  if (!isRecord(proposed)) {
    throw new Error("LLM source note must be an object");
  }

  return {
    summary: stringField(proposed, "summary"),
    raw_context: stringField(proposed, "raw_context"),
    extracted_claims: stringArrayField(proposed, "extracted_claims", true),
    open_questions: stringArrayField(proposed, "open_questions", false),
    generated_by: "llm",
    model: response.model ?? request.model
  };
}

function ingestPlanRequest(sourcePayload: NormalizedSourcePayload, baselinePlan: MutationPlan): ChatCompletionRequest {
  const baselineSourceNotePath = baselinePlan.page_actions?.[0]?.path;
  const baselineSourceNoteTitle = baselinePlan.page_actions?.[0]?.payload?.title || sourcePayload.title;
  const baselineSourceNoteLink = baselineSourceNoteTitle ? `[[${baselineSourceNoteTitle}]]` : null;
  const sourceRefs = [sourcePayload.raw_path, baselineSourceNotePath].filter(Boolean);

  return {
    stream: false,
    temperature: 0,
    messages: [
      {
        role: "system",
        content: [
          "You produce only valid JSON matching the Mutation Plan contract.",
          "This plan may be applied automatically and must not include a create action for the baseline source note.",
          "Every page_actions[].path must start exactly with one of: wiki/concepts/, wiki/entities/, wiki/topics/, or wiki/analyses/, except for one narrow update to the exact baseline source note path provided by source_note_update_allowed_path.",
          "Never write directly under wiki/, for example use wiki/concepts/lean-server.md instead of wiki/lean-server.md.",
          "Only propose small grounded changes under those allowed page path prefixes.",
          "When the source has a clear reusable domain or theme, create or update a topic under wiki/topics/ for that domain and link it to the baseline source note and relevant concepts.",
          "For example, a source primarily about productivity should normally create or update wiki/topics/productivity.md unless an equivalent topic already exists.",
          "Every created or updated concept, entity, topic, or analysis must include the baseline source note link in its Sources section when the change is grounded in this source.",
          "When you create or update reusable notes, also update the exact baseline source note with Linked Notes pointing back to those notes.",
          "The baseline source note update may only use action update and payload.sections.Linked Notes; do not modify Summary, Raw Context, Extracted Claims, frontmatter, title, or other sections.",
          "Do not write raw content dumps. Prefer noop or empty page_actions when the source lacks reusable knowledge.",
          "Every write action must include an idempotency_key and source_refs must include the raw_path and baseline source note path when available."
        ].join(" ")
      },
      {
        role: "user",
        content: JSON.stringify(
          {
            source_payload: sourcePayload,
            baseline_mutation_plan: baselinePlan,
            allowed_page_path_prefixes: ALLOWED_PAGE_PREFIXES,
            source_note_update_allowed_path: baselineSourceNotePath,
            source_note_update_allowed_sections: ["Linked Notes"],
            baseline_source_note_link: baselineSourceNoteLink,
            invalid_page_path_examples: ["wiki/lean-server.md", "wiki/example.md", "wiki/sources/other-source.md"],
            required_json_shape: {
              plan_id: `plan-${sourcePayload.source_id}-llm-ingest-review`,
              operation: "ingest",
              summary: "Auto-applied LLM plan for reusable wiki updates",
              source_refs: sourceRefs,
              page_actions: [
                {
                  path: "wiki/concepts/example-concept.md",
                  action: "noop",
                  doc_type: "concept",
                  change_type: "fact",
                  idempotency_key: `${sourcePayload.source_id}:wiki/concepts/example-concept.md`,
                  payload: {
                    sections: {
                      Facts: ["Grounded reusable fact from the source."],
                      Sources: baselineSourceNoteLink ? [baselineSourceNoteLink] : []
                    },
                    related_links: []
                  }
                },
                {
                  path: baselineSourceNotePath,
                  action: "noop",
                  doc_type: "source",
                  change_type: "new_link",
                  idempotency_key: `${sourcePayload.source_id}:source-linked-notes`,
                  payload: {
                    sections: {
                      "Linked Notes": ["[[Example Concept]]"]
                    }
                  }
                }
              ],
              index_updates: [],
              post_actions: { reindex: true, commit: true }
            }
          },
          null,
          2
        )
      }
    ]
  };
}

function isSafeRelativePath(value: unknown): value is string {
  return typeof value === "string" && !value.startsWith("/") && !value.includes("..") && !value.includes("\\");
}

function rejectAction(collection: GuardrailRejection[], item: unknown, reason: string): void {
  const record = isRecord(item) ? item : {};
  collection.push({
    path: typeof record.path === "string" ? record.path : null,
    action: typeof record.action === "string" ? record.action : null,
    reason
  });
  if (isRecord(item)) {
    item.action = "noop";
  }
}

function hasOnlyLinkedNotesSection(action: Record<string, unknown>): boolean {
  const payload = action.payload;
  if (!isRecord(payload)) {
    return false;
  }
  const payloadKeys = Object.keys(payload).filter((key) => payload[key] !== undefined);
  if (payloadKeys.some((key) => key !== "sections")) {
    return false;
  }
  const sections = payload.sections;
  if (!isRecord(sections)) {
    return false;
  }
  const sectionKeys = Object.keys(sections).filter((key) => sections[key] !== undefined);
  if (sectionKeys.length !== 1 || sectionKeys[0] !== "Linked Notes") {
    return false;
  }
  const linkedNotes = sections["Linked Notes"];
  if (typeof linkedNotes === "string") {
    return Boolean(linkedNotes.trim());
  }
  return (
    Array.isArray(linkedNotes) &&
    linkedNotes.length > 0 &&
    linkedNotes.every((item) => typeof item === "string" && item.trim())
  );
}

function parseAndGuardrailPlan(response: ChatCompletionResponse, baselinePlan: MutationPlan): {
  plan: MutationPlan;
  rejections: GuardrailRejection[];
  hasChanges: boolean;
} {
  const rawPlan = extractJson(chatText(response, "LLM ingest planner"));
  if (!isRecord(rawPlan)) {
    throw new Error("LLM ingest plan must be an object");
  }
  if (typeof rawPlan.plan_id !== "string" || !rawPlan.plan_id.trim()) {
    throw new Error("LLM ingest plan must include plan_id");
  }
  if (!Array.isArray(rawPlan.source_refs) || rawPlan.source_refs.length === 0) {
    throw new Error("LLM ingest plan must include source_refs[]");
  }
  if (!Array.isArray(rawPlan.page_actions)) {
    throw new Error("LLM ingest plan must include page_actions[]");
  }
  if (!Array.isArray(rawPlan.index_updates)) {
    rawPlan.index_updates = [];
  }

  const rejections: GuardrailRejection[] = [];
  const baselineSourceNotePath = baselinePlan.page_actions?.[0]?.path;
  const validPageActions = new Set(["create", "update", "noop"]);

  const pageActions = rawPlan.page_actions as unknown[];
  const indexUpdates = rawPlan.index_updates as unknown[];

  for (const action of pageActions) {
    if (!isRecord(action)) {
      rejectAction(rejections, action, "LLM page action must be an object");
      continue;
    }
    if (!isSafeRelativePath(action.path)) {
      rejectAction(rejections, action, "unsafe page path");
      continue;
    }
    const actionPath = action.path;
    if (typeof action.action !== "string" || !validPageActions.has(action.action)) {
      rejectAction(rejections, action, "unsupported page action");
      continue;
    }
    if (!actionPath.endsWith(".md")) {
      rejectAction(rejections, action, "page path is not markdown");
      continue;
    }

    const isBaselineSourceNoteUpdate = Boolean(baselineSourceNotePath) && actionPath === baselineSourceNotePath;
    if (isBaselineSourceNoteUpdate) {
      if (action.action === "noop") {
        continue;
      }
      if (action.action !== "update") {
        rejectAction(rejections, action, "source note backlink action must be update");
        continue;
      }
      if (!hasOnlyLinkedNotesSection(action)) {
        rejectAction(rejections, action, "source note updates may only write Linked Notes");
        continue;
      }
      if (typeof action.idempotency_key !== "string" || !action.idempotency_key.trim()) {
        rejectAction(rejections, action, "missing idempotency_key");
      }
      continue;
    }

    if (!ALLOWED_PAGE_PREFIXES.some((prefix) => actionPath.startsWith(prefix))) {
      rejectAction(rejections, action, "page path outside allowed wiki areas");
      continue;
    }
    if (
      (action.action === "create" || action.action === "update") &&
      (typeof action.idempotency_key !== "string" || !action.idempotency_key.trim())
    ) {
      rejectAction(rejections, action, "missing idempotency_key");
    }
  }

  const validIndexActions = new Set(["create", "update", "noop", undefined]);
  for (const update of indexUpdates) {
    if (!isRecord(update)) {
      rejectAction(rejections, update, "LLM index update must be an object");
      continue;
    }
    if (!isSafeRelativePath(update.path)) {
      rejectAction(rejections, update, "unsafe index path");
      continue;
    }
    if (!validIndexActions.has(update.action as string | undefined)) {
      rejectAction(rejections, update, "unsupported index action");
      continue;
    }
    if (!(update.path === "INDEX.md" || (update.path.startsWith("wiki/indexes/") && update.path.endsWith(".md")))) {
      rejectAction(rejections, update, "index path outside allowed index areas");
    }
  }

  const plan = rawPlan as unknown as MutationPlan;
  const hasChanges =
    plan.page_actions.some((action) => action.action !== "noop") ||
    (plan.index_updates ?? []).some((update) => (update.action ?? "update") !== "noop");
  return { plan, rejections, hasChanges };
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((item): item is string => typeof item === "string" && Boolean(item.trim())))];
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
  const indexPaths = Array.isArray(plan.index_updates) ? plan.index_updates.map((update) => update.path) : [];
  const affected = unique([...(mutation.created ?? []), ...(mutation.updated ?? []), ...indexPaths]);

  return {
    operation: "ingest",
    summary: `Apply LLM ingest plan for ${title}`,
    source_refs: Array.isArray(plan.source_refs) ? plan.source_refs : [],
    affected_notes: affected,
    paths_to_stage: unique([...affected, "state/runtime/idempotency-keys.json", "state/kb.db"]),
    feedback_record_ref: null,
    mutation_result_ref: null,
    commit_message: `ingest: apply LLM plan for ${truncate(title, 60)}`
  };
}

function count(values: unknown): number {
  return Array.isArray(values) ? values.length : 0;
}

function compactLines(values: unknown[]): string {
  return values.filter((value) => typeof value === "string" && value.trim()).join(String.fromCharCode(10));
}

function telegramConfig(chatIdValue: unknown): { token: string; chatId: string; missingConfig: string[] } {
  const chatId = String(chatIdValue ?? process.env.TELEGRAM_CHAT_ID ?? "").trim();
  const token = String(process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  const missingConfig: string[] = [];
  if (!token) missingConfig.push("TELEGRAM_BOT_TOKEN");
  if (!chatId) missingConfig.push("telegram_chat_id or TELEGRAM_CHAT_ID");
  return { token, chatId, missingConfig };
}

function buildTelegramFields(output: Omit<IngestRunOutput, "telegram_enabled" | "telegram_skip_reason" | "telegram_bot_token" | "telegram_message" | "telegram_ingest_message">): Pick<
  IngestRunOutput,
  "telegram_enabled" | "telegram_skip_reason" | "telegram_bot_token" | "telegram_message" | "telegram_ingest_message"
> {
  const { token, chatId, missingConfig } = telegramConfig(output.telegram_chat_id);
  const baselineCommit =
    typeof output.baseline_commit_result.commit_sha === "string"
      ? `Baseline commit: ${output.baseline_commit_result.commit_sha}`
      : "";
  const llmCommit =
    output.llm_commit_result && typeof output.llm_commit_result.commit_sha === "string"
      ? `LLM commit: ${output.llm_commit_result.commit_sha}`
      : "";
  const source = output.source_payload;
  const text = compactLines([
    "KB ingest completed",
    `Status: ${output.status}`,
    `Source: ${truncate(source.title || source.source_id || "unknown", 500)}`,
    source.raw_path ? `Raw: ${source.raw_path}` : "",
    `Baseline created/updated/skipped: ${count(output.baseline_mutation_result.created)}/${count(
      output.baseline_mutation_result.updated
    )}/${count(output.baseline_mutation_result.skipped)}`,
    output.llm_mutation_result
      ? `LLM created/updated/skipped: ${count(output.llm_mutation_result.created)}/${count(
          output.llm_mutation_result.updated
        )}/${count(output.llm_mutation_result.skipped)}`
      : "LLM changes: none",
    output.llm_guardrail_rejections.length ? `Guardrail rejections: ${output.llm_guardrail_rejections.length}` : "",
    baselineCommit,
    llmCommit
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
    telegram_ingest_message: telegramMessage
  };
}

function buildTelegramFailureFields(rawEvent: IngestRunInput, reason: string, youtubeResult: unknown): Record<string, unknown> {
  const { token, chatId, missingConfig } = telegramConfig(rawEvent.telegram_chat_id);
  const result = isRecord(youtubeResult) ? youtubeResult : {};
  const text = compactLines([
    "KB ingest failed",
    "Command: /ingest",
    rawEvent.youtube_ingest_url ? `URL: ${truncate(String(rawEvent.youtube_ingest_url), 500)}` : "",
    `Reason: ${truncate(reason, 1000)}`,
    result.video_id ? `YouTube video ID: ${result.video_id}` : ""
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
    telegram_ingest_failure_message: telegramMessage
  };
}

async function ensureRawEvent(args: ReturnType<typeof parseArgs>, rawEvent: IngestRunInput): Promise<{
  rawEvent: IngestRunInput;
  handledFailure: Record<string, unknown> | null;
}> {
  if (stringValue(rawEvent.raw_path)) {
    return { rawEvent, handledFailure: null };
  }

  const url = stringValue(rawEvent.youtube_ingest_url);
  if (!url) {
    if (stringValue(rawEvent.telegram_command) === "ingest") {
      const reason = "Telegram /ingest requires a YouTube URL after the command";
      return {
        rawEvent,
        handledFailure: {
          status: "ingest_input_invalid",
          ingest_error: reason,
          telegram_chat_id: rawEvent.telegram_chat_id ?? null,
          telegram_message_id: rawEvent.telegram_message_id ?? null,
          telegram_update_id: rawEvent.telegram_update_id ?? null,
          telegram_polled: Boolean(rawEvent.telegram_polled),
          telegram_command: rawEvent.telegram_command ?? null,
          telegram_lock_acquired: Boolean(rawEvent.telegram_lock_acquired),
          telegram_lock_id: rawEvent.telegram_lock_id ?? null,
          ...buildTelegramFailureFields(rawEvent, reason, {})
        }
      };
    }

    throw new Error("ingest-run requires raw_path, path, filePath, filename, youtube_ingest_url, youtube_url, or url");
  }

  const youtubeResult = await runToolJson<Record<string, unknown>>("youtube-transcript", {
    vault: args.vault,
    input: {
      url,
      captured_at: stringValue(rawEvent.captured_at) || new Date().toISOString(),
      language_preferences: ["en", "es"]
    }
  });
  if (youtubeResult.status !== "created" || !stringValue(youtubeResult.raw_path)) {
    const reason = stringValue(youtubeResult.reason) || stringValue(youtubeResult.error) || "Unable to create YouTube transcript";
    return {
      rawEvent: {
        ...rawEvent,
        youtube_transcript_result: youtubeResult
      },
      handledFailure: {
        status: "youtube_ingest_failed",
        youtube_ingest_status: "failed",
        youtube_ingest_error: reason,
        youtube_ingest_url: url,
        youtube_transcript_result: youtubeResult,
        telegram_chat_id: rawEvent.telegram_chat_id ?? null,
        telegram_message_id: rawEvent.telegram_message_id ?? null,
        telegram_update_id: rawEvent.telegram_update_id ?? null,
        telegram_polled: Boolean(rawEvent.telegram_polled),
        telegram_command: rawEvent.telegram_command ?? null,
        telegram_lock_acquired: Boolean(rawEvent.telegram_lock_acquired),
        telegram_lock_id: rawEvent.telegram_lock_id ?? null,
        ...buildTelegramFailureFields(rawEvent, reason, youtubeResult)
      }
    };
  }

  return {
    rawEvent: {
      ...rawEvent,
      raw_path: youtubeResult.raw_path,
      captured_at: youtubeResult.captured_at ?? rawEvent.captured_at,
      youtube_transcript_result: youtubeResult
    },
    handledFailure: null
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const initialRawEvent = normalizeRawEvent(await readJsonInput<IngestRunInput>(args.input));
  const { rawEvent, handledFailure } = await ensureRawEvent(args, initialRawEvent);
  if (handledFailure) {
    writeJsonStdout(handledFailure, args.pretty);
    return;
  }
  const sourcePayload = await runToolJson<NormalizedSourcePayload>("ingest-source", {
    vault: args.vault,
    input: rawEvent
  });
  const sourceNoteRequestBody = sourceNoteRequest(sourcePayload);
  const sourceNoteResponse = await chatCompletion(sourceNoteRequestBody);
  const sourceNote = parseSourceNote(sourceNoteResponse, sourceNoteRequestBody);
  const sourcePayloadWithNote: NormalizedSourcePayload = {
    ...sourcePayload,
    content: "",
    source_note: sourceNote
  };
  const baselinePlanOutput = await runToolJson<ToolPlanOutput>("plan-source-note", {
    vault: args.vault,
    input: sourcePayloadWithNote
  });
  const baselineMutationResult = await runToolJson<MutationResult>("apply-update", {
    vault: args.vault,
    input: baselinePlanOutput.mutation_plan
  });
  const baselineReindexResult = await runToolJson<ReindexResult>("reindex", { vault: args.vault });
  const baselineCommitResult = await runToolJson<CommitResult>("commit", {
    vault: args.vault,
    input: baselinePlanOutput.commit_input
  });

  const ingestPlanRequestBody = ingestPlanRequest(baselinePlanOutput.source_payload, baselinePlanOutput.mutation_plan);
  const ingestPlanResponse = await chatCompletion(ingestPlanRequestBody);
  const { plan: llmMutationPlan, rejections, hasChanges } = parseAndGuardrailPlan(
    ingestPlanResponse,
    baselinePlanOutput.mutation_plan
  );
  let llmMutationResult: MutationResult | null = null;
  let llmReindexResult: ReindexResult | null = null;
  let llmCommitResult: CommitResult | null = null;

  if (hasChanges) {
    llmMutationResult = await runToolJson<MutationResult>("apply-update", {
      vault: args.vault,
      input: llmMutationPlan
    });
    llmReindexResult = await runToolJson<ReindexResult>("reindex", { vault: args.vault });
    llmCommitResult = await runToolJson<CommitResult>("commit", {
      vault: args.vault,
      input: buildLlmCommitInput({
        source_payload: baselinePlanOutput.source_payload,
        llm_mutation_plan: llmMutationPlan,
        llm_mutation_result: llmMutationResult
      })
    });
  }

  const outputBase: Omit<IngestRunOutput, "telegram_enabled" | "telegram_skip_reason" | "telegram_bot_token" | "telegram_message" | "telegram_ingest_message"> = {
    status: llmMutationResult ? "baseline_ingest_applied_llm_plan_applied" : "baseline_ingest_applied_no_llm_changes",
    source_payload: baselinePlanOutput.source_payload,
    baseline_mutation_plan: baselinePlanOutput.mutation_plan,
    baseline_mutation_result: baselineMutationResult,
    baseline_reindex_result: baselineReindexResult,
    baseline_commit_result: baselineCommitResult,
    llm_source_note_meta: llmMeta(sourceNoteResponse),
    llm_mutation_plan: llmMutationPlan,
    llm_guardrail_rejections: rejections,
    llm_plan_approval_required: false,
    llm_plan_auto_apply_required: hasChanges,
    llm_mutation_result: llmMutationResult,
    llm_reindex_result: llmReindexResult,
    llm_commit_result: llmCommitResult,
    llm_ingest_meta: llmMeta(ingestPlanResponse),
    telegram_chat_id: rawEvent.telegram_chat_id ?? null,
    telegram_message_id: rawEvent.telegram_message_id ?? null,
    telegram_update_id: rawEvent.telegram_update_id ?? null,
    telegram_polled: Boolean(rawEvent.telegram_polled),
    telegram_command: rawEvent.telegram_command ?? null,
    telegram_lock_acquired: Boolean(rawEvent.telegram_lock_acquired),
    telegram_lock_id: rawEvent.telegram_lock_id ?? null,
    youtube_ingest_url: rawEvent.youtube_ingest_url ?? null,
    youtube_transcript_result: rawEvent.youtube_transcript_result ?? null
  };

  writeJsonStdout({ ...outputBase, ...buildTelegramFields(outputBase) }, args.pretty);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
