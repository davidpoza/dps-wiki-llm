## ADDED Requirements

### Requirement: Connection discovery

The system SHALL, during an ingest job and on demand after a re-embed/reindex, discover candidate connections for the ingested or affected notes by combining (a) the links proposed by the LLM mutation plan and (b) semantic nearest-neighbors from the pgvector index whose cosine similarity meets a configured threshold. Each candidate SHALL identify the target note, the proposed link (section/direction), and a score.

#### Scenario: Candidates discovered after ingest

- **WHEN** an ingest job completes the baseline note and connection discovery runs
- **THEN** the system produces a list of candidate connections (LLM-proposed and semantic-neighbor) each referencing an existing `wiki/**` note and a score

#### Scenario: Discovery on demand after re-embed

- **WHEN** a re-embed/reindex job runs to look for new connections
- **THEN** the system produces candidate connections for the affected notes using semantic neighbors above the threshold

### Requirement: Unattended and validated ingest modes

The system SHALL support two modes selectable per ingest job: `unattended` (auto-apply discovered connections) and `validated` (pause for human review before applying connections). The default mode SHALL be `unattended`, and the baseline source note SHALL always be applied regardless of mode.

#### Scenario: Unattended applies automatically

- **WHEN** an ingest job runs in `unattended` mode
- **THEN** discovered connections that pass guardrails are applied to the knowledge files without human interaction

#### Scenario: Validated pauses for review

- **WHEN** an ingest job runs in `validated` mode
- **THEN** after connection discovery the job enters an `AWAITING_REVIEW` state and applies no connection until a review decision is submitted

### Requirement: Review interface contract

The system SHALL expose the candidate connections for a job awaiting review, accept a decision marking each candidate accepted or rejected, and accept additional manually-selected target notes chosen via lexical file lookup. Accepted connections SHALL be applied directly to the knowledge files; rejected candidates SHALL NOT be written.

#### Scenario: Accept and reject applied to files

- **WHEN** a reviewer submits a decision accepting a subset of candidates plus one manually-selected note
- **THEN** the system applies only the accepted candidates and the manual selection to the `wiki/**` files, reindexes/embeds, and commits

#### Scenario: Manual selection via lexical lookup

- **WHEN** a reviewer searches for a note by keyword in the manual picker
- **THEN** the system returns matching notes by title/path/body (lexical `pg_trgm`/ILIKE lookup) for selection as connection targets

### Requirement: Guided ingestion available for any ingest job

The system SHALL make the connection-review capability available for any ingest job regardless of source kind (markdown, link).

#### Scenario: Any ingest job is reviewable

- **WHEN** any ingest job runs in `validated` mode
- **THEN** the same candidate-review interface is available regardless of the source kind
