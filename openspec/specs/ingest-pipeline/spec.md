# ingest-pipeline Specification

## Purpose
TBD - created by archiving change spring-angular-migration. Update Purpose after archive.
## Requirements
### Requirement: Normalize a raw artifact into a source payload

The system SHALL, as the first ingest step, normalize a `raw/**` artifact into a canonical source payload (source id, kind, captured timestamp, title, content, checksum, metadata), rejecting inputs outside `raw/**`.

#### Scenario: Raw artifact is normalized

- **WHEN** an ingest job runs for a valid `raw/**` path
- **THEN** the system reads the artifact, infers its source kind, computes a checksum, and produces the normalized source payload

### Requirement: LLM-cleaned baseline source note

The system SHALL request an LLM-cleaned structured source note, validate it contains non-empty summary and raw-context fields, build the baseline mutation plan that creates the `wiki/sources/` note and updates the root index, apply it, reindex, and commit.

#### Scenario: Baseline source note is created and committed

- **WHEN** the LLM returns a valid source note for the normalized payload
- **THEN** the system applies the baseline plan, reindexes, and creates a git commit for the source note

#### Scenario: Invalid source note aborts before mutation

- **WHEN** the LLM source note is missing required fields or is not valid JSON
- **THEN** the ingest fails before any `wiki/**` write

### Requirement: Guardrailed LLM mutation plan

The system SHALL request an optional richer LLM mutation plan for reusable wiki updates, validate it against guardrails (path constraints, idempotency keys, topic-creation guard, required source support), convert unsafe actions to `noop`, apply only the safe remainder, reindex, and create a second commit when changes were applied.

#### Scenario: Unsafe actions are neutralized

- **WHEN** the LLM mutation plan contains an action that violates a guardrail
- **THEN** that action is converted to `noop`, reported as a guardrail rejection, and the remaining safe actions are applied

#### Scenario: Empty plan stops after baseline

- **WHEN** the LLM mutation plan is empty
- **THEN** the ingest stops after the baseline commit and reports that no additional changes were applied

#### Scenario: Grounded updates link back to the source

- **WHEN** the LLM plan updates concept/entity/topic/analysis notes
- **THEN** those updates include a `Sources` backlink to the baseline source note

### Requirement: Multi-format source intake

The system SHALL accept ingest from a markdown upload (written under `raw/inbox/`) and from a link/URL (fetched and written under `raw/web/`) before running the normalization flow. PDF extraction is deferred to a later change.

#### Scenario: Markdown upload becomes a raw artifact

- **WHEN** a markdown file is uploaded for ingest
- **THEN** the system writes it under `raw/inbox/` and proceeds with the normal ingest flow

#### Scenario: Link is fetched into raw

- **WHEN** a URL is submitted for ingest
- **THEN** the system fetches its content, writes it under `raw/web/`, and proceeds with the normal ingest flow

### Requirement: Connection application respects the ingest mode

The system SHALL apply guardrailed connections automatically in `unattended` mode and SHALL defer connection application to the guided review in `validated` mode; the baseline source note is applied in both modes.

#### Scenario: Validated mode defers connections

- **WHEN** an ingest runs in `validated` mode
- **THEN** the baseline note is committed and connection application waits for the review decision (see `guided-ingestion`)

### Requirement: Ingest progress over SSE with file traversal

The system SHALL emit job progress events for the ingest pipeline (intake, normalization, LLM cleaning, baseline apply, connection discovery, apply, commit) over the SSE channel, including per-file events for each vault file the job reads, creates, or updates.

#### Scenario: Progress and file events reported during ingest

- **WHEN** an ingest job advances through its steps and touches vault files
- **THEN** subscribers receive `PROGRESS` events describing the current step, a per-file event (path + action) for each file touched, and a terminal `COMPLETED`, `AWAITING_REVIEW`, or `FAILED` event

