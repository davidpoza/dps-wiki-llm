# keyword-generation Specification

## Purpose
TBD - created by archiving change generate-keywords. Update Purpose after archive.
## Requirements
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

The system SHALL only consider `.md` notes located under `wiki/concepts` and `wiki/sources`. When invoked from the legacy batch endpoint (`/api/keywords/generate`), the system SHALL only generate keywords for notes that do not already have a non-empty `keywords` frontmatter field. When invoked from the new `REGENERATE_KEYWORDS` job, the system SHALL overwrite existing `keywords` unconditionally for every path listed in the job payload.

#### Scenario: Note already has keywords (legacy endpoint)

- **WHEN** the legacy `/api/keywords/generate` process encounters a note whose frontmatter already contains a non-empty `keywords` field
- **THEN** the process skips the note without calling the LLM and counts it as skipped

#### Scenario: Note already has keywords (REGENERATE_KEYWORDS job)

- **WHEN** the `REGENERATE_KEYWORDS` job processes a note whose frontmatter already contains a non-empty `keywords` field
- **THEN** the system generates new keywords via the LLM and overwrites the existing value

#### Scenario: Note is outside the target folders

- **WHEN** a `.md` note exists outside `wiki/concepts` and `wiki/sources`
- **THEN** neither the legacy process nor the job reads or modifies that note

#### Scenario: Re-running legacy endpoint after a completed run

- **WHEN** the legacy process is run a second time after a successful run
- **THEN** notes that received keywords in the first run are skipped in the second run

### Requirement: Keyword source-text selection

For each eligible note, the system SHALL derive the LLM input text from the note's `Summary` section when present and non-empty; otherwise from the full note body excluding the `Sources`, `Related`, and `Links` sections.

#### Scenario: Note has a Summary section

- **WHEN** an eligible note contains a non-empty `Summary` section
- **THEN** the process generates keywords using only the `Summary` section content

#### Scenario: Note has no Summary section

- **WHEN** an eligible note has no `Summary` section (or it is empty)
- **THEN** the process generates keywords from the remaining note body with the `Sources`, `Related`, and `Links` sections removed

### Requirement: Keywords are always in English

The system SHALL generate keywords in English regardless of the note's language, translating source terms as needed so keywords stay consistent across the vault for semantic search.

#### Scenario: Note written in another language

- **WHEN** an eligible note is written in Spanish (or any non-English language)
- **THEN** the generated `keywords` are in English

### Requirement: Keyword format normalization

The system SHALL produce keywords in a normalized form: singular, without articles, lowercase, and using hyphens instead of spaces (kebab-case). The mechanical rules (lowercase and hyphenation) SHALL be enforced in code so the stored keywords are guaranteed to be well-formed even if the model deviates.

#### Scenario: Multi-word keyword is hyphenated and lowercased

- **WHEN** the model returns a keyword such as `Machine Learning`
- **THEN** the stored keyword is `machine-learning`

#### Scenario: Duplicate keywords after normalization are collapsed

- **WHEN** the model returns keywords that normalize to the same value (for example `Machine Learning` and `machine learning`)
- **THEN** only one keyword is stored

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

