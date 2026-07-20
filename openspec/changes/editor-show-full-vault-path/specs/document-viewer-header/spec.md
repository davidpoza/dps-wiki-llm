## ADDED Requirements

### Requirement: Header shows full vault-relative path

The document viewer/editor header SHALL display the full path of the open document relative to the vault root, not only the filename.

#### Scenario: Document in a nested folder

- **WHEN** a document located at `research/papers/note.md` within the vault is open
- **THEN** the header displays the full path `research/papers/note.md`

#### Scenario: Document at the vault root

- **WHEN** a document located directly at the vault root (e.g. `note.md`) is open
- **THEN** the header displays `note.md` with no leading separator

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
