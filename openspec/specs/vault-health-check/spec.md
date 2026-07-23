# vault-health-check Specification

## Purpose
TBD - created by archiving change settings-health-check. Update Purpose after archive.
## Requirements
### Requirement: Health Check action in Settings

The system SHALL provide a "Health Check" section in the Settings screen with a control that launches the vault reconciliation process and displays its live progress and final result.

#### Scenario: Launching the health check

- **WHEN** the user clicks the "Health Check" action in Settings
- **THEN** the system starts the asynchronous reconciliation process
- **AND** the action is disabled while the process is running to prevent concurrent runs from the same view

#### Scenario: Idle state before running

- **WHEN** the Settings screen is opened and the health check has not been run
- **THEN** the Health Check section shows the action enabled and no progress indicator

### Requirement: Missing embeddings are generated

During phase 1 the system SHALL ensure that every note under `wiki/topics`, `wiki/concepts` and `wiki/sources` has an up-to-date embedding, generating embeddings for notes that do not have one or whose indexed content has changed.

#### Scenario: Note without embedding

- **WHEN** phase 1 runs and a note under `wiki/topics`, `wiki/concepts` or `wiki/sources` has no stored embedding
- **THEN** the system generates and stores its embedding
- **AND** counts it towards the "embeddings built" total

#### Scenario: Note already embedded and unchanged

- **WHEN** phase 1 runs and a note already has an embedding matching its current content
- **THEN** the system does not regenerate the embedding
- **AND** does not count it towards the "embeddings built" total

### Requirement: New connections are discovered and materialized bidirectionally

During phase 2 the system SHALL iterate over every note under `wiki/concepts` and `wiki/sources`, find semantically similar notes using embeddings (general neighbor search plus a dedicated `topic` search), and for each accepted new connection add the forward link to the source note's `Related` section and the inverse backlink to the target note's `Related` section.

#### Scenario: New semantic connection found

- **WHEN** phase 2 evaluates a source note and finds a target note whose similarity score meets the connection threshold and is not the source itself
- **THEN** the system adds `[[<target>]]` to the source note's `Related` section
- **AND** adds `[[<source>]]` to the target note's `Related` section
- **AND** counts the connection towards the "connections found" total

#### Scenario: Connection to a curated topic

- **WHEN** phase 2 evaluates a source note and the dedicated `topic` search returns a `wiki/topics` note above the topic threshold
- **THEN** the system links the source note to that topic note bidirectionally, in addition to any general semantic connections

#### Scenario: No candidates above threshold

- **WHEN** phase 2 evaluates a source note and no candidate meets the threshold
- **THEN** the source note is left unchanged

### Requirement: Only new links are added without duplication

The system SHALL add only links that do not already exist in the target `Related` section, and SHALL never create duplicate links in either the source or target note.

#### Scenario: Connection already present

- **WHEN** phase 2 would add a link that already exists in the note's `Related` section
- **THEN** the system does not add a duplicate entry
- **AND** does not count it towards the "connections found" total

#### Scenario: Same pair discovered from both directions

- **WHEN** the same source/target pair is discovered while processing each of the two notes
- **THEN** the resulting `Related` sections contain the link exactly once in each note

### Requirement: Real-time progress reporting via SSE

The system SHALL expose the process over a Server-Sent Events stream that emits incremental progress including the current phase and a processed/total count so the frontend can render a live percentage.

#### Scenario: Progress events during execution

- **WHEN** the process is running
- **THEN** the backend emits `progress` events carrying the current phase (embeddings or connections) and the processed and total counts
- **AND** the frontend updates the displayed percentage and phase in real time

#### Scenario: Stream completes

- **WHEN** both phases finish successfully
- **THEN** the backend emits a `done` event with the final aggregated result and closes the stream

### Requirement: Changes are captured in a revertible snapshot

All note modifications performed in phase 2 SHALL be recorded in a snapshot identified with `source = "HEALTH_CHECK"`, capturing the before and after content of every modified note so the run appears in the file history and can be reverted.

#### Scenario: Run that modifies notes

- **WHEN** phase 2 adds links to one or more notes
- **THEN** each modified note's prior and resulting content is recorded under a single `HEALTH_CHECK` snapshot
- **AND** the snapshot and its per-file versions are visible in the file history

#### Scenario: Run that modifies nothing

- **WHEN** the process completes without adding any new link
- **THEN** no dangling empty snapshot is left as a completed history entry

### Requirement: Completion summary

On completion the system SHALL report the number of embeddings built and the number of connections (new links) found during the run.

#### Scenario: Summary shown to the user

- **WHEN** the process finishes successfully
- **THEN** the Settings UI shows the count of embeddings built and connections found

### Requirement: Error handling

If the process fails, the system SHALL emit an error over the stream and surface it in the UI without leaving the action stuck in a running state.

#### Scenario: Failure during processing

- **WHEN** an error occurs while generating embeddings or applying connections
- **THEN** the backend emits an `error` event with a message and closes the stream
- **AND** the UI shows the error and re-enables the Health Check action

