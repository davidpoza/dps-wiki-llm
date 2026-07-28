## ADDED Requirements

### Requirement: CSLS local-scaling re-ranking

Link discovery SHALL rank candidates by a Cross-domain Similarity Local Scaling (CSLS) score rather than by raw cosine similarity, to neutralize the anisotropy and hubness of the `multilingual-e5-small` embedding space. For a source note `A` and candidate `B`, the adjusted score SHALL be:

```
CSLS(A, B) = 2 · cos(A, B) − r_k(A) − r_k(B)
```

where `r_k(X)` is the mean cosine similarity of `X` to its `k` nearest neighbors (excluding `X` itself). The value `r_k(A)` SHALL be computed at query time from the same candidate retrieval, and `r_k(B)` SHALL be read from the precomputed per-document hubness statistic maintained by the embedding index.

#### Scenario: Hub candidate is penalized

- **WHEN** a candidate note `B` is a hub (its `r_k(B)` is high because it sits near many unrelated notes)
- **THEN** its CSLS score is reduced by `r_k(B)`, so it ranks below candidates that are specifically close to the source note

#### Scenario: Mutually-close pair survives re-ranking

- **WHEN** a candidate `B` is specifically close to source `A` and neither note is a hub
- **THEN** `cos(A, B)` exceeds both `r_k(A)` and `r_k(B)`, so the CSLS score is positive and the candidate is retained

#### Scenario: Missing hubness statistic falls back to raw cosine

- **WHEN** a candidate has no precomputed `r_k(B)` value available
- **THEN** the system treats that candidate's neighborhood density as unavailable and ranks it by raw cosine rather than dropping it silently

### Requirement: Empty result when no candidate is genuinely related

Link discovery SHALL return an empty result set when no candidate clears the acceptance margin. It SHALL NOT fall back to returning the top-N raw-cosine candidates when the relative bar is not met.

#### Scenario: Flat distribution yields no links

- **WHEN** every candidate's CSLS score is below the acceptance margin (a flat, hub-dominated distribution)
- **THEN** discovery returns zero links and the modal shows its "no results" state

#### Scenario: A false link no longer surfaces

- **WHEN** the source note `muscle-hypertrophy` is scored against `5-htp` whose raw cosine is ~0.85 but which is a hub
- **THEN** the CSLS-adjusted score for `5-htp` falls below the acceptance margin and it is excluded from the results

### Requirement: Acceptance margin as the primary gate

Link discovery SHALL gate results on a configurable CSLS acceptance margin as the primary criterion. Any absolute raw-cosine threshold SHALL act only as a coarse pre-filter on the retrieved candidate pool, never as the final acceptance criterion. The acceptance margin SHALL be adjustable without code changes.

#### Scenario: Margin gates the final results

- **WHEN** a candidate's raw cosine passes the coarse pre-filter but its CSLS score is below the configured margin
- **THEN** the candidate is excluded from the returned links

#### Scenario: Margin is configurable

- **WHEN** an operator changes the CSLS acceptance margin setting
- **THEN** subsequent discovery requests apply the new margin without a code change or redeploy

### Requirement: Discovery ranking diagnostics and benchmark

The system SHALL provide a read-only diagnostics capability that reports the global pairwise cosine-similarity distribution of the embedding index (at minimum mean, p90, p95, p99) and evaluates a small labeled benchmark of known good and bad note pairs. The benchmark SHALL include `muscle-hypertrophy ↔ 5-htp` as a labeled negative pair.

#### Scenario: Global distribution is reported

- **WHEN** the diagnostics endpoint is queried
- **THEN** it returns the mean and the p90, p95, and p99 percentiles of the global pairwise cosine distribution over the index

#### Scenario: Benchmark evaluates labeled pairs

- **WHEN** the diagnostics endpoint evaluates the labeled benchmark
- **THEN** each pair is reported with its raw cosine and its CSLS-adjusted score and whether the current acceptance margin classifies it correctly

#### Scenario: Canonical negative is classified as unrelated

- **WHEN** the benchmark is evaluated with the calibrated acceptance margin
- **THEN** the `muscle-hypertrophy ↔ 5-htp` pair is classified as not-a-link
