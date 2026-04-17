import type { Logger } from "pino";

import { runToolJson } from "../../lib/run-tool.js";

export type IngestRawEvent = Record<string, unknown>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function telegramMessageFromBody(
  body: Record<string, unknown>
): Record<string, unknown> | null {
  return isRecord(body.message)
    ? body.message
    : isRecord(body.edited_message)
      ? body.edited_message
      : null;
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

/**
 * Extract and normalize all fields from a raw N8N/Telegram/CLI webhook payload.
 * Validates the Telegram chat id against TELEGRAM_CHAT_ID env var if present.
 */
export function normalizeRawEvent(
  input: IngestRawEvent,
  log: Logger
): IngestRawEvent {
  const body = isRecord(input.body) ? input.body : input;
  const telegramMessage = telegramMessageFromBody(body);
  const telegramChat = isRecord(telegramMessage?.chat) ? telegramMessage.chat : null;
  const telegramChatId =
    telegramChat?.id !== undefined ? String(telegramChat.id) : null;
  const telegramText =
    (typeof telegramMessage?.text === "string" ? telegramMessage.text.trim() : "") ||
    (typeof telegramMessage?.caption === "string" ? telegramMessage.caption.trim() : "");
  const telegramDocument = isRecord(telegramMessage?.document) ? telegramMessage.document : null;
  const telegramDocumentFileId = typeof telegramDocument?.file_id === "string" ? telegramDocument.file_id.trim() : null;
  const telegramDocumentFilename = typeof telegramDocument?.file_name === "string" ? telegramDocument.file_name.trim() : null;
  const telegramDocumentMimeType = typeof telegramDocument?.mime_type === "string" ? telegramDocument.mime_type.trim() : null;
  const allowedTelegramChatId = String(process.env.TELEGRAM_CHAT_ID || "").trim();

  log.info(
    {
      phase: "normalize-event",
      has_body_wrapper: isRecord(input.body),
      has_telegram_message: Boolean(telegramMessage),
      telegram_chat_id: telegramChatId,
      telegram_text_length: telegramText.length
    },
    "normalize-event: parsing raw input fields"
  );

  if (telegramChatId && allowedTelegramChatId && telegramChatId !== allowedTelegramChatId) {
    log.warn(
      { phase: "normalize-event", telegram_chat_id: telegramChatId },
      "normalize-event: rejected — unauthorized telegram chat id"
    );
    throw new Error(`Unauthorized Telegram chat id: ${telegramChatId}`);
  }

  const explicitRawPath =
    stringValue(body.raw_path) ||
    stringValue(body.path) ||
    stringValue(body.filePath) ||
    stringValue(body.filename);

  const youtubeUrl =
    stringValue(body.youtube_ingest_url) ||
    stringValue(body.youtube_url) ||
    stringValue(body.url) ||
    telegramIngestUrlFromText(telegramText);

  const telegramCommand =
    stringValue(input.telegram_command) ||
    stringValue(body.telegram_command) ||
    telegramCommandFromText(telegramText) ||
    null;

  const triggerSource =
    stringValue(body.trigger_source) ||
    (stringValue(body.path) || stringValue(body.filePath) || stringValue(body.filename)
      ? "local-file-trigger"
      : telegramMessage
        ? "telegram"
        : "manual");

  const result: IngestRawEvent = {
    ...(explicitRawPath ? { raw_path: explicitRawPath } : {}),
    trigger_source: triggerSource,
    captured_at: stringValue(body.captured_at) || new Date().toISOString(),
    telegram_chat_id: body.telegram_chat_id ?? telegramChatId,
    telegram_message_id:
      body.telegram_message_id ?? telegramMessage?.message_id ?? null,
    telegram_update_id: body.telegram_update_id ?? body.update_id ?? null,
    telegram_polled: Boolean(input.telegram_polled ?? body.telegram_polled),
    telegram_command: telegramCommand,
    telegram_lock_acquired: Boolean(
      input.telegram_lock_acquired ?? body.telegram_lock_acquired
    ),
    telegram_lock_id: input.telegram_lock_id ?? body.telegram_lock_id ?? null,
    youtube_ingest_url: youtubeUrl ?? null,
    youtube_transcript_result: body.youtube_transcript_result ?? null,
    telegram_document_file_id: telegramDocumentFileId ?? null,
    telegram_document_filename: telegramDocumentFilename ?? null,
    telegram_document_mime_type: telegramDocumentMimeType ?? null
  };

  log.info(
    {
      phase: "normalize-event",
      trigger_source: result.trigger_source,
      has_raw_path: Boolean(result.raw_path),
      has_youtube_url: Boolean(result.youtube_ingest_url),
      telegram_command: result.telegram_command,
      telegram_chat_id: result.telegram_chat_id
    },
    "normalize-event: event normalized successfully"
  );

  return result;
}

// ─── ensureRawEvent ───────────────────────────────────────────────────────────

type EnsureRawEventSuccess = {
  ok: true;
  rawEvent: IngestRawEvent;
};

type EnsureRawEventFailure = {
  ok: false;
  rawEvent: IngestRawEvent;
  failureStatus: "ingest_input_invalid" | "youtube_ingest_failed" | "pdf_ingest_failed";
  reason: string;
  youtubeResult?: Record<string, unknown>;
};

export type EnsureRawEventOutcome = EnsureRawEventSuccess | EnsureRawEventFailure;

/**
 * If the raw event has no raw_path, attempts to fetch a YouTube transcript.
 * Returns ok=true with the enriched rawEvent, or ok=false with failure details
 * that the caller should turn into a structured failure output.
 */
export async function ensureRawEvent(
  vault: string,
  rawEvent: IngestRawEvent,
  log: Logger
): Promise<EnsureRawEventOutcome> {
  if (stringValue(rawEvent.raw_path)) {
    log.info(
      { phase: "ensure-raw-event", raw_path: rawEvent.raw_path },
      "ensure-raw-event: raw_path already present, no YouTube fetch needed"
    );
    return { ok: true, rawEvent };
  }

  const documentFileId = stringValue(rawEvent.telegram_document_file_id);
  const documentMimeType = stringValue(rawEvent.telegram_document_mime_type);

  if (documentFileId && documentMimeType === "application/pdf") {
    const pdfResult = await runToolJson<Record<string, unknown>>("pdf-extract", {
      vault,
      input: {
        telegram_file_id: documentFileId,
        filename: stringValue(rawEvent.telegram_document_filename),
        captured_at: stringValue(rawEvent.captured_at) || new Date().toISOString()
      }
    });

    if (pdfResult.status !== "created" || !stringValue(pdfResult.raw_path)) {
      return {
        ok: false,
        rawEvent: { ...rawEvent, pdf_extract_result: pdfResult },
        failureStatus: "pdf_ingest_failed",
        reason: stringValue(pdfResult.reason) || "Unable to extract PDF content"
      };
    }

    return {
      ok: true,
      rawEvent: {
        ...rawEvent,
        raw_path: pdfResult.raw_path,
        captured_at: pdfResult.captured_at ?? rawEvent.captured_at,
        pdf_extract_result: pdfResult
      }
    };
  }

  const url = stringValue(rawEvent.youtube_ingest_url);

  if (!url) {
    if (stringValue(rawEvent.telegram_command) === "ingest") {
      const reason = "Telegram /ingest requires a YouTube URL or a PDF attachment";
      log.warn(
        { phase: "ensure-raw-event", telegram_command: rawEvent.telegram_command },
        `ensure-raw-event: ${reason}`
      );
      return {
        ok: false,
        rawEvent,
        failureStatus: "ingest_input_invalid",
        reason
      };
    }
    throw new Error(
      "ingest-run requires raw_path, path, filePath, filename, youtube_ingest_url, youtube_url, or url"
    );
  }

  log.info(
    { phase: "ensure-raw-event", youtube_url: url },
    "ensure-raw-event: no raw_path — fetching YouTube transcript"
  );

  const youtubeResult = await runToolJson<Record<string, unknown>>(
    "youtube-transcript",
    {
      vault,
      input: {
        url,
        captured_at: stringValue(rawEvent.captured_at) || new Date().toISOString(),
        language_preferences: ["en", "es"]
      }
    }
  );

  const videoId =
    typeof youtubeResult.video_id === "string" ? youtubeResult.video_id : null;

  if (youtubeResult.status !== "created" || !stringValue(youtubeResult.raw_path)) {
    const reason =
      stringValue(youtubeResult.reason) ||
      stringValue(youtubeResult.error) ||
      "Unable to create YouTube transcript";
    log.warn(
      {
        phase: "ensure-raw-event",
        youtube_url: url,
        youtube_status: youtubeResult.status,
        video_id: videoId,
        reason
      },
      "ensure-raw-event: YouTube transcript fetch failed"
    );
    return {
      ok: false,
      rawEvent: { ...rawEvent, youtube_transcript_result: youtubeResult },
      failureStatus: "youtube_ingest_failed",
      reason,
      youtubeResult
    };
  }

  log.info(
    {
      phase: "ensure-raw-event",
      youtube_url: url,
      video_id: videoId,
      raw_path: youtubeResult.raw_path
    },
    "ensure-raw-event: YouTube transcript created successfully"
  );

  return {
    ok: true,
    rawEvent: {
      ...rawEvent,
      raw_path: youtubeResult.raw_path,
      captured_at: youtubeResult.captured_at ?? rawEvent.captured_at,
      youtube_transcript_result: youtubeResult
    }
  };
}
