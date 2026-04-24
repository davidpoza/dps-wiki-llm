#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { SYSTEM_CONFIG } from "../config.js";
import { writeJsonStdout } from "../lib/infra/cli.js";
import { createLogger } from "../lib/infra/logger.js";
import { ensureDirectory, relativeVaultPath, resolveVaultRoot, resolveWithinRoot, writeJsonFile } from "../lib/storage/fs-utils.js";

type Action = "acquire" | "release" | "status";

type Args = {
  action: Action;
  vault: string;
  name: string;
  owner: string | null;
  lockId: string | null;
  ttlMs: number;
  pretty: boolean;
};

type LockRecord = {
  lock_id: string;
  name: string;
  owner: string;
  acquired_at: string;
  expires_at: string;
  expires_at_ms: number;
  pid: number;
};

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function parseArgs(argv: string[] = process.argv.slice(2)): Args {
  const action = argv[0] as Action | undefined;
  if (!action || !["acquire", "release", "status"].includes(action)) {
    throw new Error("Usage: bot-lock.ts <acquire|release|status> --vault <path> --name <name>");
  }

  const args: Args = {
    action,
    vault: SYSTEM_CONFIG.cli.defaultVault(),
    name: "telegram-bot",
    owner: null,
    lockId: null,
    ttlMs: defaultTtlMs(),
    pretty: true
  };

  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];

    if (token === "--vault") {
      args.vault = argv[++index];
      continue;
    }

    if (token === "--name") {
      args.name = argv[++index];
      continue;
    }

    if (token === "--owner") {
      args.owner = argv[++index];
      continue;
    }

    if (token === "--lock-id") {
      args.lockId = argv[++index];
      continue;
    }

    if (token === "--ttl-ms") {
      args.ttlMs = parsePositiveInteger(argv[++index], "ttl-ms");
      continue;
    }

    if (token === "--compact") {
      args.pretty = false;
      continue;
    }

    throw new Error(`Unknown option: ${token}`);
  }

  validateLockName(args.name);
  return args;
}

function defaultTtlMs(): number {
  const raw = process.env.TELEGRAM_BOT_LOCK_TTL_MS;
  if (raw === undefined || raw.trim() === "") {
    return 30 * 60 * 1000;
  }

  return parsePositiveInteger(raw, "TELEGRAM_BOT_LOCK_TTL_MS");
}

function parsePositiveInteger(value: string | undefined, label: string): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }

  return parsed;
}

function validateLockName(name: string): void {
  if (!/^[a-zA-Z0-9._-]+$/.test(name)) {
    throw new Error(`Invalid lock name: ${name}`);
  }
}

function lockPaths(rootPath: string, name: string): { dir: string; file: string } {
  const relativeDir = path.posix.join(SYSTEM_CONFIG.paths.lockDir, `${name}.lock`);
  const dir = resolveWithinRoot(rootPath, relativeDir);
  return { dir, file: path.join(dir, "lock.json") };
}

async function readLock(filePath: string): Promise<LockRecord | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as LockRecord;
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }

    if (error instanceof SyntaxError) {
      return null;
    }

    throw error;
  }
}

function lockIsActive(lock: LockRecord | null): boolean {
  return Boolean(lock && Number.isFinite(lock.expires_at_ms) && lock.expires_at_ms > Date.now());
}

async function removeLockDir(dirPath: string): Promise<void> {
  await fs.rm(dirPath, { recursive: true, force: true });
}

async function acquire(rootPath: string, args: Args): Promise<Record<string, unknown>> {
  const { dir, file } = lockPaths(rootPath, args.name);
  await ensureDirectory(path.dirname(dir));

  let staleReleased = false;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      await fs.mkdir(dir);
      const now = new Date();
      const expiresAtMs = now.valueOf() + args.ttlMs;
      const record: LockRecord = {
        lock_id: `${args.name}-${crypto.randomUUID()}`,
        name: args.name,
        owner: args.owner ?? `${args.name}-${process.pid}`,
        acquired_at: now.toISOString(),
        expires_at: new Date(expiresAtMs).toISOString(),
        expires_at_ms: expiresAtMs,
        pid: process.pid
      };
      await writeJsonFile(file, record);

      return {
        status: "acquired",
        acquired: true,
        released: false,
        stale_released: staleReleased,
        lock_id: record.lock_id,
        name: record.name,
        owner: record.owner,
        lock_path: relativeVaultPath(rootPath, dir),
        expires_at: record.expires_at
      };
    } catch (error) {
      if (!isNodeError(error) || error.code !== "EEXIST") {
        throw error;
      }

      const existing = await readLock(file);
      if (lockIsActive(existing) || attempt > 0) {
        return {
          status: "locked",
          acquired: false,
          released: false,
          stale_released: staleReleased,
          lock_id: existing?.lock_id ?? null,
          name: args.name,
          owner: existing?.owner ?? null,
          lock_path: relativeVaultPath(rootPath, dir),
          expires_at: existing?.expires_at ?? null
        };
      }

      await removeLockDir(dir);
      staleReleased = true;
    }
  }

  throw new Error(`Unable to acquire lock: ${args.name}`);
}

async function release(rootPath: string, args: Args): Promise<Record<string, unknown>> {
  const { dir, file } = lockPaths(rootPath, args.name);
  const existing = await readLock(file);

  if (!existing) {
    return {
      status: "missing",
      acquired: false,
      released: false,
      name: args.name,
      lock_path: relativeVaultPath(rootPath, dir)
    };
  }

  if (!args.lockId || existing.lock_id !== args.lockId) {
    return {
      status: "not_owner",
      acquired: false,
      released: false,
      lock_id: existing.lock_id,
      name: args.name,
      owner: existing.owner,
      lock_path: relativeVaultPath(rootPath, dir),
      expires_at: existing.expires_at
    };
  }

  await removeLockDir(dir);
  return {
    status: "released",
    acquired: false,
    released: true,
    lock_id: existing.lock_id,
    name: args.name,
    owner: existing.owner,
    lock_path: relativeVaultPath(rootPath, dir)
  };
}

async function status(rootPath: string, args: Args): Promise<Record<string, unknown>> {
  const { dir, file } = lockPaths(rootPath, args.name);
  const existing = await readLock(file);
  return {
    status: lockIsActive(existing) ? "locked" : "unlocked",
    acquired: false,
    released: false,
    lock_id: existing?.lock_id ?? null,
    name: args.name,
    owner: existing?.owner ?? null,
    lock_path: relativeVaultPath(rootPath, dir),
    expires_at: existing?.expires_at ?? null
  };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const log = createLogger("bot-lock");
  const rootPath = resolveVaultRoot(args.vault);
  log.info({ action: args.action, name: args.name }, "bot-lock started");
  const result =
    args.action === "acquire"
      ? await acquire(rootPath, args)
      : args.action === "release"
        ? await release(rootPath, args)
        : await status(rootPath, args);

  log.info({ action: args.action, acquired: (result as Record<string, unknown>).acquired }, "bot-lock completed");
  writeJsonStdout(result, args.pretty);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
