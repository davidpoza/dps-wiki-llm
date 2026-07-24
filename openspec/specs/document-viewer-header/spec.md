# document-viewer-header Specification

## Purpose
TBD - created by archiving change editor-show-full-vault-path. Update Purpose after archive.
## Requirements
### Requirement: Header shows full vault-relative path

The document viewer/editor header SHALL display the full path of the open document relative to the vault root, not only the filename. The header SHALL also display an embedding status icon as a prefix to the path, indicating whether the document has a calculated embedding and when it was last updated.

#### Scenario: Document in a nested folder

- **WHEN** a document located at `research/papers/note.md` within the vault is open
- **THEN** the header displays the full path `research/papers/note.md`

#### Scenario: Document at the vault root

- **WHEN** a document located directly at the vault root (e.g. `note.md`) is open
- **THEN** the header displays `note.md` with no leading separator

#### Scenario: Header shows embedding status icon as prefix

- **WHEN** a document is open in the editor
- **THEN** an embedding status icon is shown to the left of the file path, reflecting whether the document has a current embedding

### Requirement: Filename is visually emphasized within the path

The header SHALL render the path so that the filename (last path segment) is visually emphasized relative to the intermediate folder segments, keeping the header scannable.

#### Scenario: Nested path emphasis

- **WHEN** the header displays a path with one or more folder segments
- **THEN** the folder segments are de-emphasized (e.g. muted color) and the final filename segment is emphasized

### Requirement: Long paths do not break the layout

The header SHALL keep long paths within the available width without breaking the topbar/header layout, including on narrow (mobile) viewports.

#### Scenario: Very long path on a narrow viewport

- **WHEN** a document with a long vault-relative path is open on a narrow viewport
- **THEN** the path wraps or truncates gracefully and the surrounding layout remains intact

### Requirement: Pencil button in editor header opens the rename dialog
The editor header SHALL display a pencil icon button (`pi pi-pencil`) adjacent to the filename that opens the same rename dialog used by the file-tree context menu.

#### Scenario: Pencil button visible when a file is open
- **WHEN** a file is selected and displayed in the editor
- **THEN** a pencil icon button is visible in the editor header near the filename

#### Scenario: Pencil button not visible when no file is open
- **WHEN** no file is selected
- **THEN** the pencil button is not rendered

#### Scenario: Clicking the pencil button opens the rename dialog
- **WHEN** the user clicks the pencil button in the editor header
- **THEN** the rename dialog opens pre-populated with the current filename, identical to the dialog triggered from the file-tree context menu

