## ADDED Requirements

### Requirement: Trigger keyword generation from Settings

The system SHALL provide a "Generar keywords" control on the Configuración (Settings) screen that starts an asynchronous keyword-generation process over the existing vault notes.

#### Scenario: User starts keyword generation

- **WHEN** the user clicks the "Generar keywords" button on the Settings screen
- **THEN** the backend starts an asynchronous process that scans notes under `wiki/concepts` and `wiki/sources`
- **AND** the button enters a loading/disabled state until the process finishes

#### Scenario: Concurrent start is prevented on the client

- **WHEN** the keyword-generation process is already running
- **THEN** the button remains disabled so a second run cannot be started from the UI until the current run completes or errors

### Requirement: Real-time progress via SSE

The system SHALL stream progress of the keyword-generation process to the client over Server-Sent Events, mirroring the existing reindex stream.

#### Scenario: Progress events are emitted per note

- **WHEN** the process finishes evaluating each note
- **THEN** the backend sends a `progress` SSE event containing at least the number of notes processed and the total number of notes
- **AND** the UI updates the displayed progress in real time

#### Scenario: Completion event

- **WHEN** the process finishes processing all notes
- **THEN** the backend sends a `done` SSE event and completes the stream
- **AND** the UI shows a success message summarizing how many notes were updated

#### Scenario: Failure event

- **WHEN** the process fails with an unrecoverable error
- **THEN** the backend sends an `error` SSE event and completes the stream
- **AND** the UI shows an error message and re-enables the button

### Requirement: Scope and idempotency of keyword generation

The system SHALL only consider `.md` notes located under `wiki/concepts` and `wiki/sources`, and SHALL only generate keywords for notes that do not already have a non-empty `keywords` frontmatter field.

#### Scenario: Note already has keywords

- **WHEN** a note's frontmatter already contains a non-empty `keywords` field
- **THEN** the process skips the note without calling the LLM
- **AND** the note is counted as skipped, not updated

#### Scenario: Note is outside the target folders

- **WHEN** a `.md` note exists outside `wiki/concepts` and `wiki/sources`
- **THEN** the process does not read or modify that note

#### Scenario: Re-running after a completed run

- **WHEN** the process is run a second time after a successful run
- **THEN** notes that received keywords in the first run are skipped in the second run

### Requirement: Keyword source-text selection

For each eligible note, the system SHALL derive the LLM input text from the note's `Summary` section when present and non-empty; otherwise from the full note body excluding the `Sources`, `Related`, and `Links` sections.

#### Scenario: Note has a Summary section

- **WHEN** an eligible note contains a non-empty `Summary` section
- **THEN** the process generates keywords using only the `Summary` section content

#### Scenario: Note has no Summary section

- **WHEN** an eligible note has no `Summary` section (or it is empty)
- **THEN** the process generates keywords from the remaining note body with the `Sources`, `Related`, and `Links` sections removed

### Requirement: Persisting generated keywords

The system SHALL write generated keywords into the note's frontmatter `keywords` field using a minimal edit that preserves the rest of the frontmatter and body, and SHALL persist the change through the standard save path so it is recorded in file history and replicated to WebDAV.

#### Scenario: Keywords written to frontmatter

- **WHEN** the LLM returns keywords for an eligible note
- **THEN** a `keywords` YAML list is added to that note's frontmatter
- **AND** existing frontmatter fields, section ordering, and body content are otherwise unchanged
- **AND** the change is versioned in file history and pushed to WebDAV

#### Scenario: LLM fails for a single note

- **WHEN** keyword generation fails for an individual note (for example, the LLM returns no valid keywords after retries)
- **THEN** the process leaves that note unchanged and continues with the remaining notes
- **AND** the failure does not abort the overall run
