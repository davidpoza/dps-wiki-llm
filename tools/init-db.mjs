#!/usr/bin/env node

import path from "node:path";

import { parseArgs, writeJsonStdout } from "./lib/cli.mjs";
import { relativeVaultPath, resolveVaultRoot, resolveWithinRoot } from "./lib/fs-utils.mjs";
import { ensureSchema, openDatabase } from "./lib/db.mjs";

function parseDbPath(args, vaultRoot) {
  if (args.db) {
    return resolveWithinRoot(vaultRoot, args.db);
  }

  return resolveWithinRoot(vaultRoot, "state/kb.db");
}

async function main() {
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
