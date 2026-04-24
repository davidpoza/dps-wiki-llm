#!/usr/bin/env node

/**
 * @module hybrid-search
 *
 * CLI wrapper around `hybrid-search-fn`.  All search logic lives in the lib
 * module so that in-process callers (e.g. health-check) can invoke it without
 * spawning subprocesses and reloading the ONNX model on every query.
 *
 * Fusion formula:  finalScore = (0.6 × semanticNorm) + (0.4 × lexicalNorm)
 * Falls back to FTS-only when the semantic index has not yet been built.
 *
 * Usage:
 *   node dist/tools/hybrid-search.js [--vault <path>] [--limit N] "<query>"
 */

import { parseArgs, writeJsonStdout } from "../lib/infra/cli.js";
import { SYSTEM_CONFIG } from "../config.js";
import { hybridSearch } from "../lib/search/hybrid-search-fn.js";

function parseHybridSearchArgs() {
  const args = parseArgs();
  const limit =
    typeof args.limit === "number" && Number.isFinite(args.limit) && args.limit > 0
      ? args.limit
      : SYSTEM_CONFIG.cli.defaultSearchLimit;

  let query: string | null = null;
  let docType: string | null = null;
  const tokens = process.argv.slice(2);

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (["--vault", "--input", "--db", "--limit"].includes(token)) {
      i++;
      continue;
    }

    if (token === "--doc-type") {
      docType = tokens[++i] ?? null;
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
  const args = parseHybridSearchArgs();
  const result = await hybridSearch(args.query, {
    vault: args.vault,
    limit: args.limit,
    docType: args.docType
  });
  writeJsonStdout(result, args.pretty);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
