## ADDED Requirements

### Requirement: Document index over wiki content

The system SHALL maintain a `documents` table over `wiki/**` markdown (path, title, doc type, updated timestamp, body), rebuilt from the vault on demand, used both to embed content and to read bodies for answer context. It SHALL index only derived `wiki/` state, never `raw/`.

#### Scenario: Reindex rebuilds document rows

- **WHEN** a reindex job runs over the vault
- **THEN** the system parses every `wiki/**` markdown document and upserts its metadata and body within a single transaction

### Requirement: Sidecar incremental embedding

The system SHALL embed each document with the local embeddings sidecar (`multilingual-e5-small`, OpenAI-compatible) and store the vector in a pgvector column, updating incrementally by normalized-text fingerprint — re-embedding only documents whose fingerprint changed and pruning embeddings for deleted documents.

#### Scenario: Incremental embedding skips unchanged docs

- **WHEN** an embed job runs and a document's normalized-text hash matches the stored hash
- **THEN** the document is skipped and not re-embedded

#### Scenario: Deleted documents are pruned

- **WHEN** an embed job runs and a previously indexed document no longer exists in the vault
- **THEN** its embedding row is removed from the index

### Requirement: Semantic vector search

The system SHALL answer a search query by embedding it with the same sidecar model and returning the top-k documents by cosine distance over the pgvector index. There SHALL be no lexical or keyword leg in the answer/RAG retrieval path.

#### Scenario: Nearest-neighbor retrieval

- **WHEN** a client submits a search query
- **THEN** the query is embedded and the top-k documents are returned ranked by cosine distance, searching only derived `wiki/` state

#### Scenario: Empty index returns no results

- **WHEN** the embedding table has no rows
- **THEN** semantic search returns an empty result list rather than an error

### Requirement: Lexical file lookup for manual selection

The system SHALL provide a lightweight lexical lookup over `documents` by title, path, and body (using `pg_trgm`/ILIKE matching) to support manual selection of connection targets. This lookup is independent of the semantic RAG retrieval and SHALL NOT add a lexical leg to answer retrieval.

#### Scenario: Keyword lookup returns files

- **WHEN** a user searches a keyword in the manual connection picker
- **THEN** the system returns documents whose title, path, or body matches, ranked by lexical similarity

