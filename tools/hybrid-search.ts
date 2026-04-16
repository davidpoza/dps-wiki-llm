#!/usr/bin/env node

/**
 * @module hybrid-search
 *
 * Combine full-text (BM25) and semantic (cosine) search results into a single
 * ranked list using min-max normalisation and weighted score fusion.
 *
 * Role in the pipeline:
 *   Terminal search tool — calls both `search` (FTS/BM25) and `semantic-search`
 *   as sub-processes in parallel, then merges their outputs.  Falls back to
 *   FTS-only when the semantic index has not yet been built.
 *
 * Reads:
 *   - `<semanticDir>/manifest.json` existence check (to detect missing index).
 *   - Output of the `search` sub-process (BM25 results).
 *   - Output of the `semantic-search` sub-process (cosine similarity results).
 *
 * Writes: nothing (read-only at runtime).
 *
 * Fusion formula:
 *   finalScore = (0.6 × semanticNorm) + (0.4 × lexicalNorm)
 *
 *   The semantic leg receives a higher weight (0.6) because dense retrieval
 *   generalises better to paraphrased or multilingual queries, while the
 *   lexical leg (0.4) reinforces exact-term matches and proper nouns that
 *   embeddings may underweight.
 *
 * Why min-max normalisation?
 *   BM25 scores from SQLite FTS5 are negative (log-probability sums).
 *   Cosine similarity scores are in [-1, 1].  These two scales are
 *   incompatible — a raw weighted sum would be dominated by whichever scale
 *   happens to produce larger magnitudes.  Min-max normalisation maps each
 *   score list independently to [0, 1] (min → 0, max → 1), making the two
 *   legs directly comparable before fusion.
 *   Edge case: if all scores in a list are identical, every normalised value
 *   is set to 1 (rather than 0) to avoid penalising a leg that returned
 *   uniformly scored results.
 *
 * Internal over-fetch:
 *   Each sub-tool is queried for `limit × 3` results before fusion so that
 *   documents appearing in only one leg still have a chance to rank in the
 *   final top-K after re-scoring.
 *
 * Output:
 *   JSON on stdout conforming to the `SearchResult` contract, with an extra
 *   `mode` field set to `"hybrid"` (or `"fts"` on fallback).
 *
 * Usage:
 *   node dist/tools/hybrid-search.js [--vault <path>] [--limit N] "<query>"
 */

import { parseArgs, writeJsonStdout } from "./lib/cli.js";
import { createLogger } from "./lib/logger.js";
import { resolveVaultRoot, pathExists } from "./lib/fs-utils.js";
import { runToolJson } from "./lib/run-tool.js";
import { SYSTEM_CONFIG } from "./config.js";
import { manifestPath } from "./lib/semantic-index.js";
import type { SearchResult, SearchResultItem } from "./lib/contracts.js";

// ── Fusion weights ─────────────────────────────────────────────────────────────

/**
 * Weight applied to the normalised semantic (cosine) score in the fusion formula.
 * Must satisfy: SEMANTIC_WEIGHT + LEXICAL_WEIGHT === 1.
 */
const SEMANTIC_WEIGHT = 0.6;

/**
 * Weight applied to the normalised lexical (BM25) score in the fusion formula.
 * Must satisfy: SEMANTIC_WEIGHT + LEXICAL_WEIGHT === 1.
 */
const LEXICAL_WEIGHT = 0.4;

// ── Argument parsing ───────────────────────────────────────────────────────────

/**
 * Parse CLI arguments for hybrid-search, extending the base `parseArgs`
 * result with `query` (required positional) and a validated `limit`.
 *
 * @returns Parsed argument object with `query: string` and `limit: number`.
 * @throws {Error} If no non-empty positional query token is found.
 */
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

    // Skip the value that follows a known key-value flag.
    if (["--vault", "--input", "--db", "--limit"].includes(token)) {
      i++;
      continue;
    }

    if (token === "--doc-type") {
      docType = tokens[++i] ?? null;
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

  return { ...args, query: query.trim(), limit, docType };
}

// ── Score normalisation ────────────────────────────────────────────────────────

/**
 * Apply min-max normalisation to a list of scored items.
 *
 * Maps the score range [min, max] → [0, 1].
 * When all scores are identical (range === 0) every item receives 1 rather than
 * 0 or NaN — this avoids unfairly zeroing out a leg that returned uniformly
 * scored results (e.g. a single FTS hit).
 *
 * This is applied separately to BM25 and cosine score lists before fusion
 * because BM25 scores are negative log-probability sums (typically in
 * [-20, -1]) while cosine similarities are in [-1, 1].  Without normalisation
 * the weighted sum would be meaningless.
 *
 * @param items - Array of objects each containing a `score` property.
 * @returns Parallel array of normalised scores in [0, 1], one per input item.
 *
 * @example
 * minMaxNormalise([{ score: -10 }, { score: -5 }, { score: -1 }]);
 * // => [0, 0.555..., 1]
 */
function minMaxNormalise(items: { score: number }[]): number[] {
  if (items.length === 0) return [];

  const scores = items.map((i) => i.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min;

  // If all scores are equal, treat the entire leg as maximally relevant
  // rather than setting everything to 0 (which would eliminate the leg).
  return scores.map((s) => (range === 0 ? 1 : (s - min) / range));
}

// ── Entry point ────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseHybridSearchArgs();
  const log = createLogger("hybrid-search");
  const vaultRoot = resolveVaultRoot(args.vault);

  log.info(
    {
      phase: "startup",
      query: args.query,
      query_chars: args.query.length,
      limit: args.limit,
      semantic_weight: SEMANTIC_WEIGHT,
      lexical_weight: LEXICAL_WEIGHT
    },
    "hybrid-search: started"
  );

  // Check whether the semantic index exists
  const hasIndex = await pathExists(manifestPath(vaultRoot));

  log.info(
    { phase: "index-check", has_semantic_index: hasIndex },
    "hybrid-search: semantic index presence checked"
  );

  const docTypeArgs = args.docType ? ["--doc-type", args.docType] : [];

  if (!hasIndex) {
    // Graceful degradation: if embed-index has never been run, fall back to
    // pure FTS rather than returning an error.
    log.warn(
      { phase: "fallback", reason: "semantic index not found" },
      "hybrid-search: falling back to FTS-only"
    );

    const ftsStart = Date.now();
    const ftsResult = await runToolJson<SearchResult>("search", {
      vault: args.vault,
      args: ["--limit", String(args.limit), ...docTypeArgs, args.query]
    });

    log.info(
      {
        phase: "fts-fallback-done",
        results: ftsResult.results.length,
        duration_ms: Date.now() - ftsStart,
        top_score: ftsResult.results[0]?.score ?? null
      },
      "hybrid-search: FTS fallback completed"
    );

    writeJsonStdout({ ...ftsResult, mode: "fts" }, args.pretty);
    return;
  }

  // Over-fetch from both legs so that documents exclusive to one leg can still
  // appear in the final top-K after fusion re-scoring.
  const internalLimit = args.limit * 3;

  log.info(
    {
      phase: "parallel-fetch-start",
      internal_limit: internalLimit,
      final_limit: args.limit
    },
    "hybrid-search: launching FTS and semantic sub-processes in parallel"
  );

  const parallelStart = Date.now();

  // Run FTS and semantic search in parallel using a larger internal limit
  const [ftsResult, semanticResult] = await Promise.all([
    runToolJson<SearchResult>("search", {
      vault: args.vault,
      args: ["--limit", String(internalLimit), ...docTypeArgs, args.query]
    }),
    runToolJson<SearchResult>("semantic-search", {
      vault: args.vault,
      args: ["--limit", String(internalLimit), ...docTypeArgs, args.query]
    })
  ]);

  const parallelDuration = Date.now() - parallelStart;

  log.info(
    {
      phase: "parallel-fetch-done",
      duration_ms: parallelDuration,
      fts_results: ftsResult.results.length,
      fts_top_score: ftsResult.results[0]?.score ?? null,
      fts_bottom_score: ftsResult.results[ftsResult.results.length - 1]?.score ?? null,
      semantic_results: semanticResult.results.length,
      semantic_top_score: semanticResult.results[0]?.score ?? null,
      semantic_bottom_score: semanticResult.results[semanticResult.results.length - 1]?.score ?? null
    },
    "hybrid-search: both legs completed"
  );

  // Normalise each leg independently to [0, 1].
  // BM25 scores are negative — normalise independently before fusion.
  const ftsNorm = minMaxNormalise(ftsResult.results);
  const semNorm = minMaxNormalise(semanticResult.results);

  log.info(
    {
      phase: "normalise",
      fts_norm_min: ftsNorm.length ? Number(Math.min(...ftsNorm).toFixed(4)) : null,
      fts_norm_max: ftsNorm.length ? Number(Math.max(...ftsNorm).toFixed(4)) : null,
      sem_norm_min: semNorm.length ? Number(Math.min(...semNorm).toFixed(4)) : null,
      sem_norm_max: semNorm.length ? Number(Math.max(...semNorm).toFixed(4)) : null
    },
    "hybrid-search: scores normalised to [0, 1]"
  );

  // Build maps: path → normalised score
  const ftsMap = new Map<string, number>();
  for (let i = 0; i < ftsResult.results.length; i++) {
    ftsMap.set(ftsResult.results[i].path, ftsNorm[i]);
  }

  const semMap = new Map<string, number>();
  for (let i = 0; i < semanticResult.results.length; i++) {
    semMap.set(semanticResult.results[i].path, semNorm[i]);
  }

  // Union of all candidate paths — documents from either or both legs are eligible.
  const allPaths = new Set([...ftsMap.keys(), ...semMap.keys()]);

  // Build a lookup for metadata (title, doc_type).
  // Semantic results take precedence for metadata when a path appears in both,
  // as they carry richer frontmatter-derived fields.  FTS metadata is used as
  // fallback for paths not returned by the semantic leg.
  const metaMap = new Map<string, Pick<SearchResultItem, "title" | "doc_type">>();
  for (const item of ftsResult.results) {
    metaMap.set(item.path, { title: item.title, doc_type: item.doc_type });
  }
  for (const item of semanticResult.results) {
    if (!metaMap.has(item.path)) {
      metaMap.set(item.path, { title: item.title, doc_type: item.doc_type });
    }
  }

  // Fuse scores: documents absent from one leg receive 0 for that leg,
  // i.e. they are not penalised beyond losing their contribution from that leg.
  const fused: SearchResultItem[] = [];

  for (const p of allPaths) {
    const s = semMap.get(p) ?? 0; // normalised semantic score (0 if not in semantic results)
    const l = ftsMap.get(p) ?? 0; // normalised lexical score  (0 if not in FTS results)
    // Weighted linear combination: semantic favoured 60/40 over lexical.
    const score = SEMANTIC_WEIGHT * s + LEXICAL_WEIGHT * l;
    const meta = metaMap.get(p) ?? { title: p, doc_type: "unknown" };
    fused.push({ path: p, title: meta.title, doc_type: meta.doc_type, score });
  }

  // Sort descending by fused score; higher is more relevant.
  fused.sort((a, b) => b.score - a.score);
  const results = fused.slice(0, args.limit);

  log.info(
    {
      phase: "fusion-done",
      candidates_total: allPaths.size,
      fts_only: allPaths.size - semMap.size,
      semantic_only: allPaths.size - ftsMap.size,
      in_both: ftsMap.size + semMap.size - allPaths.size,
      results_returned: results.length,
      top_results: results.slice(0, 3).map((r) => ({
        path: r.path,
        fused_score: Number(r.score.toFixed(4)),
        semantic_norm: Number((semMap.get(r.path) ?? 0).toFixed(4)),
        lexical_norm: Number((ftsMap.get(r.path) ?? 0).toFixed(4))
      }))
    },
    "hybrid-search: fusion completed"
  );

  log.info(
    { phase: "done", results: results.length, limit: args.limit, mode: "hybrid" },
    "hybrid-search: completed"
  );

  const output = {
    query: args.query,
    limit: args.limit,
    mode: "hybrid",
    results
  };

  writeJsonStdout(output, args.pretty);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
