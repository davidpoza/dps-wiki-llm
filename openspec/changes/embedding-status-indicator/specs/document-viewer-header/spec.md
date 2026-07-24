## MODIFIED Requirements

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
