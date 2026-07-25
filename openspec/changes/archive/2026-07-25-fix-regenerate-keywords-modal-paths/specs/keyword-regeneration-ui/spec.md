## MODIFIED Requirements

### Requirement: Note selection modal in Settings

The Settings screen SHALL display a button "Seleccionar notas…" in the Keywords section that opens a modal listing all `.md` notes from the entire `wiki/` subtree (all subdirectories) with checkboxes, a text search input, and select-all / deselect-all controls.

#### Scenario: Modal opens with full note list from all wiki subdirectories

- **WHEN** the user clicks "Seleccionar notas…" in the Keywords section of Configuración
- **THEN** a modal opens showing every `.md` note found under `wiki/` (all subdirectories recursively) loaded from `GET /api/notes/list?folders=wiki`, each with a checkbox, grouped by their parent folder, and with a visual indicator when `hasKeywords` is true

#### Scenario: Note rows display vault-relative path

- **WHEN** the modal is open and notes are listed
- **THEN** each note row shows the full vault-relative path (e.g., `wiki/concepts/my-concept.md`) rather than just the bare filename

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
