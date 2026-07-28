## ADDED Requirements

### Requirement: Per-document hubness statistic

The embedding index SHALL maintain, for each document, a neighborhood-density statistic `r_k` equal to the mean cosine similarity of the document to its `k` nearest neighbors in the same embedding model space (excluding itself). This statistic SHALL be persisted alongside the embedding index and SHALL be kept in sync with embeddings: recomputed when a document's embedding changes and removed when the document's embedding is pruned. The neighbor count `k` SHALL be configurable.

#### Scenario: Hubness computed after embedding

- **WHEN** an embed job re-embeds one or more documents
- **THEN** the `r_k` statistic is recomputed for the affected documents from the current embedding index

#### Scenario: Hubness pruned with embeddings

- **WHEN** a document's embedding is pruned because the document no longer exists in the vault
- **THEN** its stored `r_k` statistic is removed as well

#### Scenario: Neighbor count is configurable

- **WHEN** an operator changes the `k` neighbor-count setting and a recompute runs
- **THEN** `r_k` is computed over the new number of nearest neighbors
