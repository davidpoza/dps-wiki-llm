## Why

Link discovery surfaces nonsensical links with high raw cosine scores — e.g. `muscle-hypertrophy` linking to `5-htp` at 0.85. The embedding layer is already correct (E5 `query:` prefix on both sides, matching document/query templates, normalized vectors, exact pgvector cosine), so the fault is in the **selection layer**. `multilingual-e5-small` is anisotropic: unrelated notes routinely score 0.80–0.86, and some notes are "hubs" that sit near everything. An absolute threshold is meaningless when the baseline varies per note, and today `applyRelativeFilter` makes it worse: when no candidate clears `mean + 2σ` (the norm for a flat E5 distribution) it falls back to returning the **top-3 raw cosine**, which is exactly how the `5-htp` false link reaches the user.

## What Changes

- **Fix the broken fallback**: when no candidate clears the relative acceptance bar, return **no links** instead of the top-3 raw-cosine candidates. "No links" is the correct answer for a note with no genuinely close neighbors.
- **Add CSLS (Cross-domain Similarity Local Scaling) re-ranking** to neutralize hubness/anisotropy: score each candidate as `CSLS(A,B) = 2·cos(A,B) − r_k(A) − r_k(B)`, where `r_k(X)` is the mean cosine of `X` to its `k` nearest neighbors. Hub notes (high `r_k`) stop surfacing as false links; mutually-close pairs survive.
- **Precompute per-document hubness** `r_k(X)` once when embeddings change, stored alongside the embedding index, so discovery only computes `r_k(A)` for the source note at query time and looks up `r_k(B)` per candidate.
- **Replace the hard-coded absolute threshold** with a data-driven acceptance margin over the CSLS score, calibrated (not guessed) against a small labeled benchmark.
- **Add a diagnostics capability**: an endpoint/command that reports the global pairwise similarity distribution (mean, p90, p95, p99) and evaluates a small labeled benchmark of known good/bad pairs (with `muscle-hypertrophy ↔ 5-htp` as the canonical negative) so the margin and `k` can be tuned and the fix verified.
- **Apply the same CSLS selection to every automated link-proposal path, not just the interactive modal.** A shared `CslsRanker` replaces the raw `>= 0.72` filter in `HealthCheckService` (which writes the `Related` section on disk) and `ConnectionDiscoveryService` (ingest connection candidates). This is essential because the health check — not the modal — is what actually wrote false links like `[[5-htp3]]` into notes. The ranker degrades to the coarse absolute threshold when hubness has not been backfilled yet, so it is never stricter than the previous behavior.

## Capabilities

### New Capabilities
- `link-discovery-ranking`: How link-discovery selects and ranks candidates — CSLS local-scaling re-ranking, the acceptance-margin policy, the empty-result behavior when nothing is genuinely related, and the diagnostics/benchmark used to calibrate and verify it.

### Modified Capabilities
- `semantic-retrieval`: The embedding index additionally maintains a per-document neighborhood-density statistic (hubness `r_k`), recomputed in sync with embeddings (refreshed for changed documents, pruned for deleted ones).

## Impact

- **Backend services**: a shared `CslsRanker` (CSLS re-ranking + margin selection + empty-result behavior + coarse-threshold degrade), applied in `LinkDiscoveryService`, `HealthCheckService`, and `ConnectionDiscoveryService`; `EmbeddingIndexService` triggers hubness recompute after embedding.
- **Persistence**: `DocumentIndexRepository` / `JdbcDocumentIndexRepository` gain queries to compute `r_k` per document (pgvector KNN) and to read it back during discovery; new storage for the per-document hubness value (column or table) via a DB migration.
- **API**: new read-only diagnostics endpoint (global distribution + benchmark evaluation); `LinkScoreController` may expose the CSLS-adjusted score alongside raw cosine.
- **Config**: `k` (neighbors for `r_k`) and the CSLS acceptance margin become configurable settings replacing the absolute `link.similarity-threshold` as the primary gate.
- **Tests**: unit tests for CSLS scoring and empty-result behavior; a benchmark fixture of labeled pairs.
- **Not touched**: embedding generation, the `query:` prefix, stored embedding vectors, and the discovery modal UI (it keeps consuming the returned results).
