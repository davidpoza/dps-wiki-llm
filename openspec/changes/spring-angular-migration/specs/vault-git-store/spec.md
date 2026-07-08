## ADDED Requirements

### Requirement: Vault-scoped safe path resolution

The system SHALL resolve every read and write against a configured vault root and SHALL reject any path that escapes the vault root via traversal or absolute paths.

#### Scenario: Traversal is rejected

- **WHEN** a mutation targets a path that resolves outside the vault root
- **THEN** the operation is rejected before any filesystem access

#### Scenario: POSIX-normalized stored paths

- **WHEN** a vault file path is persisted as metadata
- **THEN** it is stored as a normalized POSIX-style path relative to the vault root

### Requirement: Preserve the raw/wiki boundary

The system SHALL treat `raw/**` as the only ingest trigger source and `wiki/**` as derived state, and SHALL never react automatically to changes under `wiki/**`.

#### Scenario: Ingest only accepts raw inputs

- **WHEN** an ingest request references a path outside `raw/**`
- **THEN** the ingest is rejected as an invalid source

### Requirement: Idempotent markdown rendering and merge

The system SHALL render notes by merging frontmatter and `##` sections rather than replacing whole files, so re-applying the same content does not duplicate bullets, paragraphs, or frontmatter values.

#### Scenario: Re-applying identical content is a no-op

- **WHEN** the same section content is merged into an existing note twice
- **THEN** the note body is unchanged after the second merge

#### Scenario: Section-scoped merge

- **WHEN** a mutation adds a fact to the `Facts` section of an existing note
- **THEN** only that section is updated and other sections and frontmatter are preserved

### Requirement: Mutation application with idempotency keys

The system SHALL apply a canonical mutation plan (create / update / noop actions) against the vault, tracking applied idempotency keys so a plan re-applied with the same keys is skipped.

#### Scenario: Duplicate plan is skipped

- **WHEN** a mutation plan whose idempotency keys were already applied is submitted again
- **THEN** the affected actions are reported as idempotent hits and not re-written

### Requirement: Topic creation guard

The system SHALL reject any `create` action whose target path is under `wiki/topics/`, while allowing `update` actions on existing topic files.

#### Scenario: Topic create is blocked

- **WHEN** a mutation plan contains a `create` action targeting `wiki/topics/**`
- **THEN** the mutation application fails and no file is written for that action

#### Scenario: Topic update is allowed

- **WHEN** a mutation plan updates an existing `wiki/topics/**` file with related links or grounded context
- **THEN** the update is applied

### Requirement: Git-backed provenance

The system SHALL commit vault changes per operation using a configured git identity, stage only the files relevant to the operation, and record a structured change-log entry for the operation.

#### Scenario: Commit created for an applied operation

- **WHEN** a mutation operation applies changes to the vault
- **THEN** the system stages the affected files, writes a change-log entry, and creates a git commit, returning the commit SHA

#### Scenario: Failed pipeline rolls back the vault

- **WHEN** a multi-step vault operation fails after partial writes
- **THEN** compensating actions restore the vault to the pre-operation git HEAD
