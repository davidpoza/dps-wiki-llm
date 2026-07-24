## ADDED Requirements

### Requirement: Note selection modal in Settings

The Settings screen SHALL display a button "Seleccionar notas…" in the Keywords section that opens a modal listing all `.md` notes from `wiki/concepts` and `wiki/sources` with checkboxes, a text search input, and select-all / deselect-all controls.

#### Scenario: Modal opens with full note list

- **WHEN** the user clicks "Seleccionar notas…" in the Keywords section of Configuración
- **THEN** a modal opens showing every note from `wiki/concepts` and `wiki/sources` loaded from `GET /api/notes/list`, each with a checkbox, grouped by folder, and with a visual indicator when `hasKeywords` is true

#### Scenario: Search filters the list

- **WHEN** the user types in the search input inside the modal
- **THEN** the displayed note list is filtered client-side to entries whose path or title contains the search term (case-insensitive), without any network request

#### Scenario: Select all / deselect all

- **WHEN** the user clicks "Seleccionar todo"
- **THEN** all checkboxes matching the current filter are checked

- **WHEN** the user clicks "Deseleccionar todo"
- **THEN** all checkboxes are unchecked

#### Scenario: Regenerate button label shows selection count

- **WHEN** the user has N notes checked
- **THEN** the confirm button reads "Regenerar keywords (N)" and is disabled when N = 0

#### Scenario: Job is enqueued and modal closes

- **WHEN** the user clicks "Regenerar keywords (N)" with N > 0
- **THEN** the frontend calls `POST /api/keywords/regenerate` with the selected paths, closes the modal, and navigates to `/jobs` so the user can follow progress

#### Scenario: Error feedback on enqueue failure

- **WHEN** the enqueue request fails
- **THEN** the modal shows an inline error message and remains open for the user to retry

### Requirement: Regenerate keywords button in editor toolbar

The markdown editor toolbar SHALL display a "Regenerar keywords" action button (visible only when the open note is under `wiki/concepts` or `wiki/sources`) that enqueues a `REGENERATE_KEYWORDS` job for the current note and navigates to `/jobs`.

#### Scenario: Button visible for eligible notes

- **WHEN** a note under `wiki/concepts` or `wiki/sources` is open in the editor
- **THEN** a "Regenerar keywords" button (or icon with tooltip) is visible in the editor toolbar

#### Scenario: Button hidden for non-eligible notes

- **WHEN** a note outside `wiki/concepts` and `wiki/sources` is open in the editor
- **THEN** the "Regenerar keywords" button is not visible

#### Scenario: Button triggers job and navigates to /jobs

- **WHEN** the user clicks the "Regenerar keywords" button in the editor toolbar
- **THEN** the frontend calls `POST /api/keywords/regenerate` with `{"paths": ["<current-note-path>"]}`, and on success navigates to `/jobs`

#### Scenario: Button disabled during in-flight request

- **WHEN** the regenerate request is in flight
- **THEN** the button enters a loading/disabled state until the response is received
