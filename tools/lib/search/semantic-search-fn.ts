/**
 * @module semantic-search-fn
 *
 * Pure-function wrapper around the dense-vector (cosine similarity) search
 * logic.  Extracted from `semantic-search.ts` so callers within the same
 * process (e.g. `hybrid-search-fn`, `health-check`) can share the already-
 * loaded ONNX pipeline singleton from `local-transformers-provider` instead
 * of paying the model-load cost on every subprocess invocation.
 */

import { resolveVaultRoot } from "../storage/fs-utils.js";
import { createLocalTransformersProvider } from "./local-transformers-provider.js";
import { loadManifest, loadAllEmbeddingUnits, cosineSimilarity } from "../storage/semantic-index.js";
import type { SearchResult } from "../core/contracts.js";

// ── Public API ─────────────────────────────────────────────────────────────────

export interface SemanticSearchOptions {
  vault?: string;
  limit?: number;
  docType?: string | null;
}

/**
 * Embed `query` and return the top-K most semantically similar wiki notes.
 *
 * The ONNX pipeline is loaded lazily on the first call and reused for all
 * subsequent calls within the same process — the singleton lives in
 * `local-transformers-provider`.  This makes repeated calls from health-check
 * pay the model-load cost only once.
 *
 * Returns an empty result set (rather than throwing) when the semantic index
 * has not yet been built, matching the behaviour of the standalone CLI tool.
 *
 * @param query   - Raw natural-language query string.
 * @param options - Optional vault/limit/docType overrides.
 * @returns `SearchResult` sorted descending by cosine similarity.
 */
export async function semanticSearch(query: string, options: SemanticSearchOptions = {}): Promise<SearchResult> {
  const vaultRoot = resolveVaultRoot(options.vault);
  const limit = options.limit ?? 10;

  const manifest = await loadManifest(vaultRoot);
  const units = await loadAllEmbeddingUnits(vaultRoot, manifest);

  if (units.length === 0) {
    return { query, limit, results: [] };
  }

  const provider = createLocalTransformersProvider();
  const [queryVec] = await provider.embed([query]);

  const candidates = options.docType ? units.filter((u) => u.doc_type === options.docType) : units;
  const scored = candidates.map((unit) => ({
    path: unit.path,
    title: unit.title,
    doc_type: unit.doc_type,
    score: cosineSimilarity(queryVec, unit.embedding)
  }));

  scored.sort((a, b) => b.score - a.score);

  return {
    query,
    limit,
    results: scored.slice(0, limit)
  };
}
