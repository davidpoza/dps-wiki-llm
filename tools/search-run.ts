#!/usr/bin/env node

import { SYSTEM_CONFIG } from "./config.js";
import { parseArgs, readJsonInput, writeJsonStdout } from "./lib/cli.js";
import { resolveVaultRoot, pathExists } from "./lib/fs-utils.js";
import { manifestPath } from "./lib/semantic-index.js";
import { createLogger } from "./lib/logger.js";
import { runToolJson } from "./lib/run-tool.js";
import { releaseTelegramLockAfterFailure } from "./lib/telegram-lock.js";
import type { SearchResult } from "./lib/contracts.js";
import { buildSearchNotification } from "./services/notifications/telegram.js";
import type { TelegramBaseFields, TelegramMessage } from "./services/notifications/telegram.js";

type SearchRunInput = Record<string, unknown>;

type SearchRunOutput = TelegramBaseFields & {
  status: "search_completed";
  query: string;
  retrieval: SearchResult;
  telegram_chat_id: unknown;
  telegram_message_id: unknown;
  telegram_update_id: unknown;
  telegram_polled: boolean;
  telegram_command: unknown;
  telegram_lock_acquired: boolean;
  telegram_lock_id: unknown;
  telegram_search_message: TelegramMessage | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stripTelegramCommand(text: string): string {
  return text.replace(/^\/search(?:@\w+)?\s*/i, "").trim();
}

function normalizeInput(input: SearchRunInput): {
  query: string;
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

  const bodyQuery = stringValue(body.query) ?? stringValue(body.question);
  const query = telegramText ? stripTelegramCommand(telegramText) : bodyQuery ?? "";

  if (!query) {
    throw new Error("No search query provided. Usage: /search <query>");
  }

  const limit =
    Number.isFinite(Number(body.limit)) && Number(body.limit) > 0
      ? Number(body.limit)
      : SYSTEM_CONFIG.cli.defaultSearchLimit;

  return {
    query,
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

async function main(): Promise<void> {
  const args = parseArgs();
  const log = createLogger("search-run");
  let lockContext: unknown = null;

  log.info({ phase: "startup" }, "search-run: started");

  try {
    const input = await readJsonInput<SearchRunInput>(args.input);
    lockContext = input;

    const normalized = normalizeInput(input);
    lockContext = normalized;

    log.info(
      {
        phase: "normalize-input",
        query_length: normalized.query.length,
        query_preview: normalized.query.slice(0, 80),
        limit: normalized.limit,
        telegram_chat_id: normalized.telegram_chat_id,
        telegram_command: normalized.telegram_command
      },
      "search-run: [normalize-input] input normalized"
    );

    const vaultRoot = resolveVaultRoot(args.vault);
    const hasSemanticIndex = await pathExists(manifestPath(vaultRoot));
    const searchTool = hasSemanticIndex ? "hybrid-search" : "search";

    log.info(
      {
        phase: "search",
        query_length: normalized.query.length,
        limit: normalized.limit,
        search_tool: searchTool,
        has_semantic_index: hasSemanticIndex
      },
      "search-run: [search] querying wiki"
    );

    const retrieval = await runToolJson<SearchResult>(searchTool, {
      vault: args.vault,
      args: ["--limit", String(normalized.limit), normalized.query]
    });

    log.info(
      {
        phase: "search",
        results: retrieval.results?.length ?? 0,
        top_result: retrieval.results?.[0]?.path ?? null,
        top_score: retrieval.results?.[0]?.score ?? null,
        mode: retrieval.mode ?? null
      },
      "search-run: [search] completed"
    );

    const notification = buildSearchNotification({
      telegram_chat_id: normalized.telegram_chat_id,
      query: normalized.query,
      retrieval
    });

    const output: SearchRunOutput = {
      status: "search_completed",
      query: normalized.query,
      retrieval,
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
        results: retrieval.results?.length ?? 0,
        mode: retrieval.mode ?? null
      },
      "search-run: completed"
    );

    writeJsonStdout(output, args.pretty);
  } catch (error) {
    log.error(
      {
        phase: "error",
        err: error instanceof Error ? error.message : String(error)
      },
      "search-run: pipeline failed — releasing lock"
    );

    await releaseTelegramLockAfterFailure(args.vault, lockContext, "search-run");
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
