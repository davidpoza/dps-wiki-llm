#!/usr/bin/env node

import { parseArgs, writeJsonStdout } from "./lib/cli.js";
import { relativeVaultPath, resolveVaultRoot, resolveWithinRoot } from "./lib/fs-utils.js";
import { ensureSchema, openDatabase } from "./lib/db.js";
import { SYSTEM_CONFIG } from "./config.js";
import type { CliArgs } from "./lib/contracts.js";

/**
 * Initialize the SQLite database used for wiki indexing and retrieval.
 */

/**
 * Resolve the database location, defaulting to the canonical vault path.
 *
 * @param {{ db: string | null }} args
 * @param {string} vaultRoot
 * @returns {string}
 */
function parseDbPath(args: Pick<CliArgs, "db">, vaultRoot: string): string {
  if (args.db) {
    return resolveWithinRoot(vaultRoot, args.db);
  }

  return resolveWithinRoot(vaultRoot, SYSTEM_CONFIG.paths.dbPath);
}

async function main(): Promise<void> {
  const args = parseArgs();
  const vaultRoot = resolveVaultRoot(args.vault);
  const dbPath = parseDbPath(args, vaultRoot);
  const db = await openDatabase(dbPath);

  try {
    ensureSchema(db);
  } finally {
    db.close();
  }

  writeJsonStdout(
    {
      db_path: relativeVaultPath(vaultRoot, dbPath),
      initialized: true
    },
    args.pretty
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
