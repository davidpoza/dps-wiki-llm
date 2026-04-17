/**
 * @module hybrid-search-fn
 *
 * Pure-function wrapper around the hybrid (BM25 + cosine) search logic.
 * Extracted from `hybrid-search.ts` so callers within the same process
 * (e.g. `health-check`) avoid spawning subprocesses and reloading the ONNX
 * model on every query.
 *
 * Fusion formula:  finalScore = (0.6 × semanticNorm) + (0.4 × lexicalNorm)
 * Falls back to FTS-only when the semantic index is absent.
 */

import { resolveVaultRoot, pathExists } from "./fs-utils.js";
import { manifestPath } from "./semantic-index.js";
import { ftsSearch } from "./fts-search-fn.js";
import { semanticSearch } from "./semantic-search-fn.js";
import { SYSTEM_CONFIG } from "../config.js";
import type { SearchResult, SearchResultItem } from "./contracts.js";

// ── Fusion weights ─────────────────────────────────────────────────────────────

const SEMANTIC_WEIGHT = 0.6;
const LEXICAL_WEIGHT = 0.4;

// ── Helpers ────────────────────────────────────────────────────────────────────

function minMaxNormalise(items: { score: number }[]): number[] {
  if (items.length === 0) return [];
  const scores = items.map((i) => i.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const range = max - min;
  return scores.map((s) => (range === 0 ? 1 : (s - min) / range));
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface HybridSearchOptions {
  vault?: string;
  limit?: number;
  docType?: string | null;
}

/**
 * Run a hybrid BM25 + semantic search and return fused, ranked results.
 *
 * Both legs run in the same process: no subprocesses are spawned, and the
 * ONNX model singleton in `local-transformers-provider` is reused across
 * successive calls, paying the load cost only once per process lifetime.
 *
 * @param query   - Raw natural-language query string.
 * @param options - Optional vault/limit/docType overrides.
 * @returns `SearchResult` with fused scores, sorted descending.
 */
export async function hybridSearch(query: string, options: HybridSearchOptions = {}): Promise<SearchResult> {
  const vaultRoot = resolveVaultRoot(options.vault);
  const limit = options.limit ?? SYSTEM_CONFIG.cli.defaultSearchLimit;
  const hasIndex = await pathExists(manifestPath(vaultRoot));

  if (!hasIndex) {
    const ftsResult = await ftsSearch(query, { vault: options.vault, limit, docType: options.docType });
    return { ...ftsResult, mode: "fts" } as SearchResult;
  }

  const internalLimit = limit * 3;

  const [ftsResult, semanticResult] = await Promise.all([
    ftsSearch(query, { vault: options.vault, limit: internalLimit, docType: options.docType }),
    semanticSearch(query, { vault: options.vault, limit: internalLimit, docType: options.docType })
  ]);

  const ftsNorm = minMaxNormalise(ftsResult.results);
  const semNorm = minMaxNormalise(semanticResult.results);

  const ftsMap = new Map<string, number>();
  for (let i = 0; i < ftsResult.results.length; i++) {
    ftsMap.set(ftsResult.results[i].path, ftsNorm[i]);
  }

  const semMap = new Map<string, number>();
  for (let i = 0; i < semanticResult.results.length; i++) {
    semMap.set(semanticResult.results[i].path, semNorm[i]);
  }

  const allPaths = new Set([...ftsMap.keys(), ...semMap.keys()]);

  const metaMap = new Map<string, Pick<SearchResultItem, "title" | "doc_type">>();
  for (const item of ftsResult.results) {
    metaMap.set(item.path, { title: item.title, doc_type: item.doc_type });
  }
  for (const item of semanticResult.results) {
    if (!metaMap.has(item.path)) {
      metaMap.set(item.path, { title: item.title, doc_type: item.doc_type });
    }
  }

  const fused: SearchResultItem[] = [];
  for (const p of allPaths) {
    const s = semMap.get(p) ?? 0;
    const l = ftsMap.get(p) ?? 0;
    const score = SEMANTIC_WEIGHT * s + LEXICAL_WEIGHT * l;
    const meta = metaMap.get(p) ?? { title: p, doc_type: "unknown" };
    fused.push({ path: p, title: meta.title, doc_type: meta.doc_type, score });
  }

  fused.sort((a, b) => b.score - a.score);

  return {
    query,
    limit,
    mode: "hybrid",
    results: fused.slice(0, limit)
  } as SearchResult;
}
