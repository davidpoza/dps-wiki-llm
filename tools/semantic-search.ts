#!/usr/bin/env node

/**
 * @module semantic-search
 *
 * Embed a free-text query and retrieve the top-K most semantically similar
 * documents from the local vector index.
 *
 * Role in the pipeline:
 *   Downstream of `embed-index` (requires the index to exist).  Called
 *   directly for pure semantic retrieval, or spawned as a sub-process by
 *   `hybrid-search` which combines its output with BM25 results.
 *
 * Reads:
 *   - `<semanticDir>/manifest.json` — to discover indexed units.
 *   - `<semanticDir>/notes/*.json`  — all EmbeddingUnit files (loaded into memory).
 *
 * Writes: nothing (read-only at runtime).
 *
 * Scoring:
 *   Each indexed unit is scored with cosine similarity between the query
 *   embedding and the stored document embedding.  Results are sorted
 *   descending and the top `--limit` entries are returned.
 *
 * Output:
 *   JSON on stdout conforming to the `SearchResult` contract (structurally
 *   compatible with the FTS `search` tool output so callers treat them uniformly).
 *
 * Usage:
 *   node dist/tools/semantic-search.js [--vault <path>] [--limit N] "<query>"
 */

import { parseArgs, writeJsonStdout } from "./lib/cli.js";
import { createLogger } from "./lib/logger.js";
import { resolveVaultRoot } from "./lib/fs-utils.js";
import { SYSTEM_CONFIG } from "./config.js";
import { createLocalTransformersProvider } from "./lib/local-transformers-provider.js";
import {
  loadManifest,
  loadAllEmbeddingUnits,
  cosineSimilarity
} from "./lib/semantic-index.js";
import type { SearchResult } from "./lib/contracts.js";

// ── Argument parsing ───────────────────────────────────────────────────────────

/**
 * Parse CLI arguments for semantic-search, extending the base `parseArgs`
 * result with `query` (required positional) and a validated `limit`.
 *
 * The query must be the first non-flag positional token.  Known value-bearing
 * flags (`--vault`, `--limit`, etc.) are skipped along with their arguments so
 * they are not mistakenly captured as the query string.
 *
 * @returns Parsed argument object with `query: string` and `limit: number`.
 * @throws {Error} If no non-empty positional query token is found.
 */
function parseSemanticSearchArgs() {
  const args = parseArgs();
  const limit =
    typeof args.limit === "number" && Number.isFinite(args.limit) && args.limit > 0
      ? args.limit
      : SYSTEM_CONFIG.semantic.topK;

  let query: string | null = null;
  let skipNext = false;

  for (const token of process.argv.slice(2)) {
    if (skipNext) {
      skipNext = false;
      continue;
    }

    // Skip the value that follows a known key-value flag.
    if (["--vault", "--input", "--db", "--limit"].includes(token)) {
      skipNext = true;
      continue;
    }

    // Skip boolean flags.
    if (["--no-write", "--write", "--compact"].includes(token)) {
      continue;
    }

    // The first remaining token is the query.
    if (!token.startsWith("--") && query === null) {
      query = token;
    }
  }

  if (!query || !query.trim()) {
    throw new Error("Expected search query as the first positional argument");
  }

  return { ...args, query: query.trim(), limit };
}

// ── Entry point ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseSemanticSearchArgs();
  const log = createLogger("semantic-search");
  const vaultRoot = resolveVaultRoot(args.vault);

  log.info(
    {
      phase: "startup",
      query: args.query,
      query_chars: args.query.length,
      limit: args.limit,
      model: SYSTEM_CONFIG.semantic.model
    },
    "semantic-search: started"
  );

  // Load the full index into memory for brute-force nearest-neighbour search.
  // At personal-wiki scale this is faster than an ANN index due to zero setup cost.
  const indexLoadStart = Date.now();
  const manifest = await loadManifest(vaultRoot);
  const units = await loadAllEmbeddingUnits(vaultRoot, manifest);

  log.info(
    {
      phase: "index-loaded",
      units: units.length,
      manifest_model: manifest.model,
      manifest_dimension: manifest.dimension,
      manifest_last_rebuild: manifest.last_rebuild_at,
      duration_ms: Date.now() - indexLoadStart
    },
    "semantic-search: index loaded into memory"
  );

  if (units.length === 0) {
    log.warn(
      { phase: "index-empty" },
      "semantic-search: index is empty — run embed-index first"
    );
    const empty: SearchResult = { query: args.query, limit: args.limit, results: [] };
    writeJsonStdout(empty, args.pretty);
    return;
  }

  // Embed the query using the same model that was used to build the index.
  // Mismatched models would produce vectors in different spaces, giving
  // meaningless cosine similarities.
  const provider = createLocalTransformersProvider();

  log.info(
    {
      phase: "query-embed-start",
      model: provider.model,
      query: args.query,
      query_chars: args.query.length
    },
    "semantic-search: embedding query"
  );

  const queryEmbedStart = Date.now();
  // The detailed per-inference log (input_preview, duration_ms, output_dim, output_norm)
  // is emitted inside local-transformers-provider.
  const [queryVec] = await provider.embed([args.query]);
  const queryEmbedDuration = Date.now() - queryEmbedStart;

  log.info(
    {
      phase: "query-embed-done",
      model: provider.model,
      duration_ms: queryEmbedDuration,
      vector_dim: queryVec.length
    },
    "semantic-search: query embedded"
  );

  // Score every indexed unit against the query vector.
  const scoringStart = Date.now();
  const scored = units.map((unit) => ({
    path: unit.path,
    title: unit.title,
    doc_type: unit.doc_type,
    score: cosineSimilarity(queryVec, unit.embedding)
  }));

  // Sort descending by cosine similarity; higher score = more relevant.
  scored.sort((a, b) => b.score - a.score);
  const results = scored.slice(0, args.limit);
  const scoringDuration = Date.now() - scoringStart;

  log.info(
    {
      phase: "scoring-done",
      candidates_scored: scored.length,
      duration_ms: scoringDuration,
      top_score: results[0]?.score ?? null,
      bottom_score: results[results.length - 1]?.score ?? null,
      top_results: results.slice(0, 3).map((r) => ({
        path: r.path,
        score: Number(r.score.toFixed(4))
      }))
    },
    "semantic-search: scoring completed"
  );

  log.info(
    {
      phase: "done",
      results: results.length,
      limit: args.limit
    },
    "semantic-search: completed"
  );

  const output: SearchResult = {
    query: args.query,
    limit: args.limit,
    results
  };

  writeJsonStdout(output, args.pretty);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
