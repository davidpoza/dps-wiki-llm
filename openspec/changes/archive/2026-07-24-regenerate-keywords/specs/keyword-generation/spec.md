## MODIFIED Requirements

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
