## Context

Link discovery embeds a source note (title + keywords template) and retrieves nearest documents from the pgvector index, then filters them in `LinkDiscoveryService`. The embedding pipeline is already correct: `OpenAiCompatibleEmbeddingClient` applies the E5 `query:` prefix on both the document and query sides, `EmbeddingIndexService` embeds the identical `Primary topic: … Related concepts: …` template that discovery queries with, TEI returns L2-normalized vectors (`normalize:true`), and pgvector computes an exact cosine via `1 - (e <=> e)`. There is no cosine, prefix, or representation bug.

The defect is in selection. `multilingual-e5-small` is strongly anisotropic — unrelated notes routinely score 0.80–0.86 — and some notes are hubs that sit near everything. `LinkDiscoveryService.applyRelativeFilter` tries a relative bar (`mean + 2σ`), but:

1. It computes `mean`/`σ` over the already-truncated `≥ 0.72` pool (right-tail-truncated → compressed σ → unreliable bar).
2. When nothing clears `mean + 2σ` (the norm for a flat E5 distribution) it returns the **top-3 raw cosine** candidates. This is the exact path that surfaces `muscle-hypertrophy ↔ 5-htp` at 0.85.
3. It only considers the source note's candidate distribution, never the candidate's own neighborhood density, so a hub candidate always slips through.

Constraints: keep it a re-ranking layer (do not re-embed or mutate stored vectors); pgvector + JDBC; the vault is a personal wiki (hundreds to low thousands of notes), so per-document KNN precompute is affordable.

## Goals / Non-Goals

**Goals:**
- Stop nonsensical high-cosine links (the `5-htp` case) by making selection robust to E5 anisotropy and hubness.
- Return **no links** when nothing is genuinely related, instead of raw top-N filler.
- Make the acceptance criterion data-driven and verifiable via a diagnostics + benchmark path, not hand-tuned constants.
- Keep the embedding/storage layer and the discovery modal UI untouched.

**Non-Goals:**
- Changing the embedding model, the `query:` prefix, or the stored vectors.
- Global mean-centering / re-embedding of the index (heavier, mutates storage; CSLS achieves the same locally).
- Mutual-KNN reciprocity as a hard gate (CSLS already captures the neighborhood-density signal; reciprocity can be a later refinement).
- Frontend redesign — the modal keeps consuming the returned results and its existing "no results" state.

## Decisions

### Decision 1: CSLS local scaling as the ranking score

Rank by `CSLS(A,B) = 2·cos(A,B) − r_k(A) − r_k(B)`, where `r_k(X)` is the mean cosine of `X` to its `k` nearest neighbors. This is the standard fix for hubness in dense retrieval: it penalizes both a popular candidate `B` (high `r_k(B)`) and a source `A` living in a dense region (high `r_k(A)`), so only *specifically* close pairs score positively.

- **Why over a smarter absolute threshold:** the baseline cosine varies per note, so no single absolute value is correct; CSLS re-centers per note.
- **Why over global mean-centering:** mean-centering requires recomputing μ, subtracting from every vector, renormalizing, storing centered vectors, and re-indexing on every re-embed — it mutates storage and still doesn't address per-note hubness as directly. CSLS is a pure re-ranking overlay that never touches stored vectors.
- **Why over `mean + 2σ` alone:** that only uses A's distribution and is computed on a truncated pool; it cannot penalize a hub candidate.

### Decision 2: Precompute and persist per-document hubness `r_k`

`r_k(B)` is needed for every candidate at query time. Computing it on the fly for each candidate would mean an extra KNN query per candidate per request. Instead, precompute `r_k(X)` for every document once when its embedding changes and store it next to the index.

- **Storage:** a `hubness` (double) value per (document, model). Add a column to `document_embeddings` (nullable, populated after embedding) or a small side table keyed by `(document_id, model)`. Prefer a column on `document_embeddings` to keep it lifecycle-coupled to the embedding row (pruned automatically with the row).
- **Computation:** for each document, `SELECT AVG(1 - (e_other.embedding <=> e_self.embedding))` over its top-`k` neighbors via an `ORDER BY … LIMIT k` subquery, same model, excluding itself.
- **Refresh:** `EmbeddingIndexService.embedIncremental` already knows which documents changed; after upserting embeddings it triggers an `r_k` recompute for the changed set. Because a changed embedding also shifts its neighbors' neighborhoods slightly, an initial full recompute runs on backfill; incremental recompute of only changed docs is acceptable drift for a personal wiki (documented trade-off).
- **`r_k(A)` at query time:** discovery already retrieves a candidate pool for A; compute `r_k(A)` from the top-`k` of that same retrieval, so no extra round trip.

### Decision 3: Acceptance margin replaces the absolute threshold as the gate

Gate final results on `CSLS(A,B) ≥ margin` (configurable app setting). The existing `link.similarity-threshold` is demoted to an optional coarse pre-filter on the retrieved pool (or dropped). Default margin is chosen from the benchmark (Decision 4), starting near `0` (i.e. the pair must be closer to each other than to their average neighbor) and tuned.

- Candidate pool size stays generous (e.g. current `CANDIDATE_POOL = 20`) so `r_k(A)` and the margin see a meaningful local distribution.

### Decision 4: Diagnostics endpoint + labeled benchmark for calibration

Add a read-only diagnostics path that (a) reports the global pairwise cosine distribution (mean, p90/p95/p99) sampled over the index, and (b) evaluates a small labeled benchmark of good/bad pairs — including `muscle-hypertrophy ↔ 5-htp` as the canonical negative — reporting raw cosine, CSLS score, and pass/fail against the current margin. This turns "looks fixed" into a measured result and provides the basis for choosing `k` and `margin`. The benchmark pairs live as a checked-in fixture so the calibration is reproducible and can back a test.

## Risks / Trade-offs

- **CSLS may suppress a legitimate link between two hub-ish notes** → Acceptable failure mode: missing a weak link is far better than asserting a nonsense link at 0.85. The benchmark lets us tune `k`/`margin` to balance this.
- **Incremental `r_k` drift**: re-embedding a document changes its neighbors' true `r_k`, but we only recompute changed docs → For a personal wiki the drift is small; a full recompute runs on backfill and can be re-triggered. Documented and bounded.
- **Precompute cost is O(N·k) KNN queries** on full backfill → Fine at this vault scale (hundreds–low thousands); runs inside the existing embed job and only touches changed docs incrementally.
- **Margin is a new tunable** that could be set wrong → Diagnostics + benchmark make the correct range observable rather than guessed; ships with a calibrated default.
- **Changed scores are user-visible** (discovery may now return fewer or zero links where it used to return three) → This is the intended correction; the modal already has a "no results" state.

## Migration Plan

1. Add the `hubness` storage (DB migration; nullable so existing rows remain valid).
2. Ship hubness computation + backfill; run once to populate all documents.
3. Add CSLS re-ranking behind the new margin gate in `LinkDiscoveryService`; keep the absolute pre-filter as a safety net initially.
4. Add the diagnostics endpoint + benchmark fixture; calibrate `k` and `margin`; set the default margin from the benchmark.
5. Roll back by reverting `LinkDiscoveryService` to the previous filter — stored `hubness` is inert if unused, and no embeddings were mutated.

## Open Questions

- Exact default `k` and `margin` — resolved empirically from the diagnostics/benchmark during implementation.
- Whether to drop the absolute `link.similarity-threshold` entirely or retain it as a coarse pre-filter — lean toward retaining as a cheap pool pre-filter, gate on the margin.
- Whether diagnostics is an authenticated HTTP endpoint vs. a maintenance job/command — default to a read-only endpoint consistent with existing controllers.
