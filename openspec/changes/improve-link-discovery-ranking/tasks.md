## 1. Persistence: hubness storage

- [x] 1.1 Add Flyway migration `V39__document_embeddings_hubness.sql` adding a nullable `hubness DOUBLE PRECISION` column to `document_embeddings` (populated after embedding, pruned automatically with the row)
- [x] 1.2 Extend `DocumentIndexRepository` with `updateHubness(UUID documentId, String model, double hubness)` and a per-path lookup `findHubnessByPath(String model)` → `Map<String, Double>` for discovery (plus `findDocumentIdsMissingHubness` for backfill)
- [x] 1.3 Add a repository query `computeHubness(UUID documentId, String model, int k)` that returns `AVG(1 - (e_other.embedding <=> e_self.embedding))` over the document's top-`k` nearest neighbors (same model, excluding itself) using an `ORDER BY … LIMIT k` subquery
- [x] 1.4 Implement the new methods in `JdbcDocumentIndexRepository`. NOTE: this project has no DB test harness (all repositories are `@MockBean`/in-memory fakes), so the SQL methods are covered via the service-level fake-repository tests rather than a `JdbcDocumentIndexRepositoryTests` against a live DB.

## 2. Hubness computation lifecycle

- [x] 2.1 Add a `k` neighbor-count config setting (`link.hubness-k`, default 10) via `LinkRankingSettings`, read where hubness is computed
- [x] 2.2 In `EmbeddingIndexService.embedIncremental`, after upserting embeddings, recompute and persist `hubness` for the changed documents via the repository
- [x] 2.3 On full backfill / when hubness is null for embedded docs, compute `r_k` for those documents (via `findDocumentIdsMissingHubness`) so the column is populated for the whole index
- [x] 2.4 Ensure hubness is dropped with its embedding row when a document is pruned (column lives on `document_embeddings`; verified by the fake-prune test)
- [x] 2.5 Unit test: changed docs get recomputed hubness and pruned docs leave no hubness (`embedIncrementalComputesHubnessAndPrunesItWithEmbeddings`)

## 3. CSLS re-ranking in link discovery

- [x] 3.1 Add a `link.csls-margin` config setting (default 0.05) and read it in `LinkDiscoveryService` via `LinkRankingSettings`
- [x] 3.2 In `LinkDiscoveryService.discover`, compute `r_k(A)` for the source note from the top-`k` of the retrieved candidate pool (`meanTopK`)
- [x] 3.3 Look up `r_k(B)` per candidate from stored hubness; compute `CSLS(A,B) = 2·cos(A,B) − r_k(A) − r_k(B)` and rank candidates by it
- [x] 3.4 Replace `applyRelativeFilter` with margin-based selection (`selectByCsls`): keep candidates with `CSLS ≥ link.csls-margin`, sorted by CSLS desc, limited to `MAX_RESULTS`
- [x] 3.5 Remove the top-3 raw-cosine fallback — return an empty list when no candidate clears the margin
- [x] 3.6 Demote the absolute `link.similarity-threshold` to a coarse pre-filter on the candidate pool only; `CANDIDATE_POOL` stays 20
- [x] 3.7 Handle missing `r_k(B)`: fall back to source-like density (`rkB = rkA`, monotonic in raw cosine) rather than dropping the candidate silently

## 4. Diagnostics & benchmark

- [x] 4.1 Add a checked-in benchmark fixture (`link-discovery-benchmark.json`) of labeled pairs, including `muscle-hypertrophy ↔ 5-htp3` as the canonical negative (+ `5-htp3 ↔ serotonina` / `5-htp3 ↔ vias-metabolismo-del-triptofano` as positives)
- [x] 4.2 Add `sampleGlobalSimilarityStats(model, sampleSize)` returning mean, p90, p95, p99 over a random pair sample
- [x] 4.3 Add a read-only `GET /links/diagnostics` endpoint (`LinkDiagnosticsService` + `LinkScoreController`) returning the global distribution plus, for each benchmark pair, raw cosine, CSLS score, and pass/fail against the current margin
- [x] 4.4 CSLS-adjusted scores surfaced via `/links/diagnostics` per benchmark pair. `/links/score` intentionally left returning raw cosine to avoid disturbing the editor's existing consumption.

## 5. Calibration & verification

- [ ] 5.1 (NEEDS RUNNING BACKEND + REAL INDEX) Run `GET /links/diagnostics` against the real index; record the global distribution (confirm the anisotropy: mean well above 0)
- [ ] 5.2 (NEEDS RUNNING BACKEND + REAL INDEX) Tune `link.hubness-k` and `link.csls-margin` from the benchmark so all labeled negatives (incl. `muscle-hypertrophy ↔ 5-htp3`) classify as not-a-link and known positives are retained; set the tuned defaults. Current defaults (k=10, margin=0.05) are a starting point, not yet calibrated against the real distribution.
- [x] 5.3 Unit test asserting the `5-htp3` hub is excluded and a genuine link is retained under the margin (`LinkDiscoveryRankingTests.excludesHubFalseLinkAndKeepsGenuineLink`, plus empty-result / coarse-filter / missing-hubness cases)
- [ ] 5.4 (NEEDS RUNNING BACKEND + EDITOR) Manual E2E: open `muscle-hypertrophy` in the editor, run Link Discovery, confirm `5-htp3` no longer appears and genuine links still do (or "no results" when appropriate)

## 6. Extend CSLS to all automated link-proposal paths

- [x] 6.1 Extract the CSLS selection + `meanTopK` into a shared `CslsRanker` (returns `SearchResult`s), with an empty-hubness → coarse-threshold degrade; refactor `LinkDiscoveryService` to use it (stored `r_k(A)` with `meanTopK` fallback)
- [x] 6.2 Apply `CslsRanker` in `HealthCheckService`: inject `AppProperties` + `AppSettingRepository`, compute hubness once per run, replace both `>= 0.72` filters (general + topic) with CSLS before writing `Related`. Phase-1 embed backfills hubness so CSLS is active in phase 2 (self-healing)
- [x] 6.3 Apply `CslsRanker` in `ConnectionDiscoveryService`: inject `DocumentIndexRepository` + `AppProperties`, replace both threshold filters (semantic + topic) with CSLS
- [x] 6.4 Update `HealthCheckServiceTests` and `ConnectionDiscoveryServiceTests` constructors; empty-hubness mock keeps their existing assertions (coarse-threshold degrade). Retarget `LinkDiscoveryRankingTests` to `CslsRanker` and add the empty-hubness-degrade case

## 7. Housekeeping

- [x] 7.1 `mvn -f backend/pom.xml spotless:apply` applied; `mvn -f backend/pom.xml test` green (173 tests, 0 failures)
- [x] 7.2 Updated `docs/03-ai/semantic-search.md` Ranking section: CSLS across all three paths, shared `CslsRanker`, degrade behavior, hubness storage, settings, and diagnostics endpoint
