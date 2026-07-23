# note-enrich Specification

## Purpose
TBD - created by archiving change editor-enrich-button. Update Purpose after archive.
## Requirements
### Requirement: Enrich endpoint processes note and returns summary and keywords
The backend SHALL expose `POST /api/files/enrich?path=<path>` that reads the file at the given path, sends its content to the LLM using the `source-note-system` prompt, and returns a JSON response `{ "summary": "<string>", "keywords": ["<string>", ...] }`.

#### Scenario: Successful enrichment
- **WHEN** a valid file path is provided and the LLM responds successfully
- **THEN** the endpoint returns HTTP 200 with `{ summary, keywords }` where summary is a non-empty string and keywords is a non-empty array of lowercase kebab-case strings

#### Scenario: File not found
- **WHEN** the provided path does not correspond to an existing file in the vault
- **THEN** the endpoint returns HTTP 400

#### Scenario: LLM failure after retries
- **WHEN** the LLM call fails or returns malformed JSON after all retry attempts
- **THEN** the endpoint returns HTTP 500 with an error message

### Requirement: Editor toolbar ENRICH button triggers enrichment
The ExplorerComponent editor toolbar SHALL include an ENRICH button that is visible whenever a file is open. Clicking it calls `POST /api/files/enrich?path=<currentPath>` and applies the result to the editor state.

#### Scenario: Button visible when file is open
- **WHEN** a file is selected and loaded in the editor
- **THEN** the ENRICH button is visible in the editor toolbar

#### Scenario: Button disabled while enrichment is in progress
- **WHEN** enrichment is already in flight
- **THEN** the ENRICH button shows a loading indicator and cannot be clicked again

#### Scenario: Button not visible when no file is open
- **WHEN** no file is selected in the editor
- **THEN** the ENRICH button is not rendered (the entire editor header is hidden)

### Requirement: Enrichment applies keywords to frontmatter
After a successful enrichment call, the system SHALL replace the `keywords` field in the file's frontmatter with the array returned by the backend, and mark the editor as dirty.

#### Scenario: Note has existing frontmatter keywords
- **WHEN** enrichment succeeds and the frontmatter already contains a `keywords` field
- **THEN** the `keywords` field is replaced with the LLM-returned keywords and the editor is marked dirty

#### Scenario: Note has no keywords in frontmatter
- **WHEN** enrichment succeeds and the frontmatter has no `keywords` field
- **THEN** a `keywords` field is added with the LLM-returned keywords and the editor is marked dirty

#### Scenario: Note has no frontmatter
- **WHEN** enrichment succeeds and the note has no frontmatter block
- **THEN** a frontmatter block is created with only the `keywords` field, the editor is marked dirty

### Requirement: Enrichment injects Summary section if absent
After a successful enrichment call, the system SHALL insert a `## Summary` section at the beginning of the note body if the body does not already contain a heading whose text is "Summary" (case-insensitive), then mark the editor dirty.

#### Scenario: Note has no Summary heading
- **WHEN** enrichment succeeds and the body contains no `## Summary` (or `# Summary`, etc.) heading
- **THEN** a `## Summary` heading followed by the LLM-returned summary text is prepended to the body, and the editor content is updated

#### Scenario: Note already has a Summary heading
- **WHEN** enrichment succeeds and the body already contains a heading with text "Summary"
- **THEN** the body is left unchanged (only keywords are updated in frontmatter)

### Requirement: Enrichment errors surface as toast notification
If the enrich API call fails, the system SHALL display a toast with error severity and SHALL re-enable the ENRICH button.

#### Scenario: Network or server error
- **WHEN** the enrichment API call returns an error response or times out
- **THEN** a toast notification with error severity is shown and the ENRICH button returns to its normal (non-loading) state

