#!/usr/bin/env node

import { parseArgs, writeJsonStdout } from "./lib/cli.js";
import { SYSTEM_CONFIG } from "./config.js";
import { ftsSearch } from "./lib/fts-search-fn.js";

/**
 * Search the SQLite FTS index built from wiki markdown documents.
 *
 * CLI wrapper around `fts-search-fn`.  All search logic lives in the lib
 * module so that in-process callers (e.g. health-check, hybrid-search-fn)
 * can invoke it without spawning a subprocess.
 */

function parseSearchArgs() {
  const args = parseArgs();
  const limit =
    typeof args.limit === "number" && Number.isFinite(args.limit) && args.limit > 0
      ? args.limit
      : SYSTEM_CONFIG.cli.defaultSearchLimit;
  let query: string | null = null;
  let docType: string | null = null;
  let skipNext = false;

  for (let i = 0; i < process.argv.slice(2).length; i++) {
    const token = process.argv.slice(2)[i];

    if (skipNext) {
      skipNext = false;
      continue;
    }

    if (["--vault", "--input", "--db", "--limit"].includes(token)) {
      skipNext = true;
      continue;
    }

    if (token === "--doc-type") {
      docType = process.argv.slice(2)[++i] ?? null;
      continue;
    }

    if (["--no-write", "--write", "--compact"].includes(token)) {
      continue;
    }

    if (!token.startsWith("--") && query === null) {
      query = token;
    }
  }

  if (!query || !query.trim()) {
    throw new Error("Expected search query as the first positional argument");
  }

  return { ...args, query: query.trim(), limit, docType };
}

async function main(): Promise<void> {
  const args = parseSearchArgs();
  const result = await ftsSearch(args.query, {
    vault: args.vault,
    dbPath: args.db ?? undefined,
    limit: args.limit,
    docType: args.docType
  });
  writeJsonStdout(result, args.pretty);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
