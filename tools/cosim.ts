#!/usr/bin/env node

import { parseArgs, readJsonInput, writeJsonStdout } from "./lib/cli.js";
import { resolveVaultRoot, pathExists } from "./lib/fs-utils.js";
import {
  loadManifest,
  loadAllEmbeddingUnits,
  cosineSimilarity,
  manifestPath
} from "./lib/semantic-index.js";
import type { EmbeddingUnit } from "./lib/semantic-index.js";
import { createLogger } from "./lib/logger.js";
import { releaseTelegramLockAfterFailure } from "./lib/telegram-lock.js";
import {
  resolveTelegramConfig,
  type TelegramBaseFields,
  type TelegramMessage
} from "./services/notifications/telegram.js";

type CosimInput = Record<string, unknown>;

type UnitSummary = { path: string; title: string; doc_type: string; text_preview: string };

type CosimOutput = TelegramBaseFields & {
  status: "cosim_completed" | "cosim_no_index" | "cosim_not_found";
  note_a: string;
  note_b: string;
  similarity: number | null;
  unit_a: UnitSummary | null;
  unit_b: UnitSummary | null;
  not_found: string[];
  telegram_chat_id: unknown;
  telegram_message_id: unknown;
  telegram_update_id: unknown;
  telegram_polled: boolean;
  telegram_command: unknown;
  telegram_lock_acquired: boolean;
  telegram_lock_id: unknown;
  telegram_cosim_message: TelegramMessage | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stripCommand(text: string): string {
  return text.replace(/^\/cosim(?:@\w+)?\s*/i, "").trim();
}

/**
 * Resolve a note identifier against the loaded units.
 * Accepts: exact vault-relative path ("wiki/concepts/foo.md"),
 *          basename with extension ("foo.md"),
 *          or bare slug ("foo").
 * Returns the first match (path match preferred over slug match).
 */
function resolveUnit(
  query: string,
  byPath: Map<string, EmbeddingUnit>,
  bySlug: Map<string, EmbeddingUnit>
): EmbeddingUnit | null {
  // Exact path match
  if (byPath.has(query)) return byPath.get(query)!;
  // Normalised path (ensure .md suffix)
  const withMd = query.endsWith(".md") ? query : `${query}.md`;
  if (byPath.has(withMd)) return byPath.get(withMd)!;
  // Slug match (case-insensitive)
  const slug = query.toLowerCase().replace(/\.md$/, "").split("/").at(-1) ?? query;
  return bySlug.get(slug) ?? null;
}

function normalizeInput(input: CosimInput): {
  note_a: string;
  note_b: string;
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

  const stripped = telegramText ? stripCommand(telegramText) : "";
  const tokens = stripped.split(/\s+/).filter(Boolean);

  if (tokens.length < 2) {
    throw new Error("Uso: /cosim <nota-a> <nota-b>  (slug o path relativo)");
  }

  return {
    note_a: tokens[0],
    note_b: tokens[1],
    telegram_chat_id: telegramChatId,
    telegram_message_id: telegramMessage?.message_id ?? null,
    telegram_update_id: body.update_id ?? null,
    telegram_polled: Boolean(input.telegram_polled),
    telegram_command: input.telegram_command ?? null,
    telegram_lock_acquired: Boolean(input.telegram_lock_acquired),
    telegram_lock_id: input.telegram_lock_id ?? null
  };
}

function buildNotification(
  telegramChatId: unknown,
  result: Pick<CosimOutput, "status" | "note_a" | "note_b" | "similarity" | "unit_a" | "unit_b" | "not_found">
): TelegramBaseFields & { telegram_cosim_message: TelegramMessage | null } {
  const { token, chatId, missingConfig } = resolveTelegramConfig(telegramChatId);

  let text: string;
  if (result.status === "cosim_no_index") {
    text = "cosim: índice semántico no disponible. Ejecuta /embedindex primero.";
  } else if (result.status === "cosim_not_found") {
    text = [
      "cosim: notas no encontradas en el índice:",
      ...result.not_found.map((n) => `  • ${n}`)
    ].join("\n");
  } else {
    const sim = result.similarity !== null ? result.similarity.toFixed(6) : "?";
    const a = result.unit_a;
    const b = result.unit_b;
    text = [
      `cosim: ${sim}`,
      `A: ${a?.title ?? result.note_a} [${a?.doc_type ?? "?"}]`,
      `   ${a?.path ?? ""}`,
      `B: ${b?.title ?? result.note_b} [${b?.doc_type ?? "?"}]`,
      `   ${b?.path ?? ""}`
    ].join("\n");
  }

  const msg: TelegramMessage | null = missingConfig.length
    ? null
    : { chat_id: chatId, text, disable_web_page_preview: true };

  return {
    telegram_enabled: missingConfig.length === 0,
    telegram_skip_reason: missingConfig.length
      ? `Missing Telegram config: ${missingConfig.join(", ")}`
      : null,
    telegram_bot_token: token,
    telegram_message: msg,
    telegram_cosim_message: msg
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const log = createLogger("cosim");
  let lockContext: unknown = null;

  log.info({ phase: "startup" }, "cosim: started");

  try {
    const input = await readJsonInput<CosimInput>(args.input);
    lockContext = input;

    const normalized = normalizeInput(input);
    lockContext = normalized;

    log.info(
      { phase: "normalize-input", note_a: normalized.note_a, note_b: normalized.note_b },
      "cosim: input normalized"
    );

    const vaultRoot = resolveVaultRoot(args.vault);
    const hasIndex = await pathExists(manifestPath(vaultRoot));

    if (!hasIndex) {
      log.warn({ phase: "no-index" }, "cosim: semantic index not found");
      const notification = buildNotification(normalized.telegram_chat_id, {
        status: "cosim_no_index",
        note_a: normalized.note_a,
        note_b: normalized.note_b,
        similarity: null,
        unit_a: null,
        unit_b: null,
        not_found: []
      });
      const output: CosimOutput = {
        status: "cosim_no_index",
        note_a: normalized.note_a,
        note_b: normalized.note_b,
        similarity: null,
        unit_a: null,
        unit_b: null,
        not_found: [],
        telegram_chat_id: normalized.telegram_chat_id,
        telegram_message_id: normalized.telegram_message_id,
        telegram_update_id: normalized.telegram_update_id,
        telegram_polled: normalized.telegram_polled,
        telegram_command: normalized.telegram_command,
        telegram_lock_acquired: normalized.telegram_lock_acquired,
        telegram_lock_id: normalized.telegram_lock_id,
        ...notification
      };
      writeJsonStdout(output, args.pretty);
      return;
    }

    const manifest = await loadManifest(vaultRoot);
    const units = await loadAllEmbeddingUnits(vaultRoot, manifest);

    const byPath = new Map<string, EmbeddingUnit>(units.map((u) => [u.path, u]));
    const bySlug = new Map<string, EmbeddingUnit>();
    for (const u of units) {
      const slug = u.path.split("/").at(-1)?.replace(/\.md$/, "")?.toLowerCase() ?? "";
      if (slug && !bySlug.has(slug)) bySlug.set(slug, u);
    }

    const unitA = resolveUnit(normalized.note_a, byPath, bySlug);
    const unitB = resolveUnit(normalized.note_b, byPath, bySlug);

    const notFound: string[] = [];
    if (!unitA) notFound.push(normalized.note_a);
    if (!unitB) notFound.push(normalized.note_b);

    if (notFound.length > 0) {
      log.warn({ phase: "not-found", not_found: notFound }, "cosim: notes not found in index");
      const notification = buildNotification(normalized.telegram_chat_id, {
        status: "cosim_not_found",
        note_a: normalized.note_a,
        note_b: normalized.note_b,
        similarity: null,
        unit_a: null,
        unit_b: null,
        not_found: notFound
      });
      const output: CosimOutput = {
        status: "cosim_not_found",
        note_a: normalized.note_a,
        note_b: normalized.note_b,
        similarity: null,
        unit_a: null,
        unit_b: null,
        not_found: notFound,
        telegram_chat_id: normalized.telegram_chat_id,
        telegram_message_id: normalized.telegram_message_id,
        telegram_update_id: normalized.telegram_update_id,
        telegram_polled: normalized.telegram_polled,
        telegram_command: normalized.telegram_command,
        telegram_lock_acquired: normalized.telegram_lock_acquired,
        telegram_lock_id: normalized.telegram_lock_id,
        ...notification
      };
      writeJsonStdout(output, args.pretty);
      return;
    }

    const similarity = cosineSimilarity(unitA!.embedding, unitB!.embedding);

    log.info(
      {
        phase: "done",
        path_a: unitA!.path,
        path_b: unitB!.path,
        similarity
      },
      "cosim: completed"
    );

    const summaryA: UnitSummary = {
      path: unitA!.path,
      title: unitA!.title,
      doc_type: unitA!.doc_type,
      text_preview: unitA!.text_preview
    };
    const summaryB: UnitSummary = {
      path: unitB!.path,
      title: unitB!.title,
      doc_type: unitB!.doc_type,
      text_preview: unitB!.text_preview
    };

    const notification = buildNotification(normalized.telegram_chat_id, {
      status: "cosim_completed",
      note_a: normalized.note_a,
      note_b: normalized.note_b,
      similarity,
      unit_a: summaryA,
      unit_b: summaryB,
      not_found: []
    });

    const output: CosimOutput = {
      status: "cosim_completed",
      note_a: normalized.note_a,
      note_b: normalized.note_b,
      similarity,
      unit_a: summaryA,
      unit_b: summaryB,
      not_found: [],
      telegram_chat_id: normalized.telegram_chat_id,
      telegram_message_id: normalized.telegram_message_id,
      telegram_update_id: normalized.telegram_update_id,
      telegram_polled: normalized.telegram_polled,
      telegram_command: normalized.telegram_command,
      telegram_lock_acquired: normalized.telegram_lock_acquired,
      telegram_lock_id: normalized.telegram_lock_id,
      ...notification
    };

    writeJsonStdout(output, args.pretty);
  } catch (error) {
    log.error(
      { phase: "error", err: error instanceof Error ? error.message : String(error) },
      "cosim: failed — releasing lock"
    );
    await releaseTelegramLockAfterFailure(args.vault, lockContext, "cosim");
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
