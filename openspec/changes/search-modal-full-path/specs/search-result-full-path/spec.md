## ADDED Requirements

### Requirement: Search results display full vault-relative path
Each result row in the file-search modal SHALL show the directory portion of the file's vault-relative path as a secondary subtitle below the filename. Root-level files (no parent directory) SHALL show no subtitle.

#### Scenario: File in nested directory shows directory path
- **WHEN** the search modal lists a file located at `folder/subfolder/note.md`
- **THEN** the result row shows `note.md` as the primary label and `folder/subfolder/` as a muted secondary line

#### Scenario: Root-level file shows no path subtitle
- **WHEN** the search modal lists a file located at `readme.md` (no parent directory)
- **THEN** the result row shows only `readme.md` with no secondary line

### Requirement: Search filter matches against full vault-relative path
The search input SHALL filter files by matching the query string against the full vault-relative path (`node.data`), not just the filename label.

#### Scenario: Searching by directory name surfaces relevant files
- **WHEN** the user types `cardiology` in the search input
- **THEN** all files whose path contains `cardiology` are shown, even if their filename does not contain `cardiology`

#### Scenario: Searching by filename still works
- **WHEN** the user types `notes`
- **THEN** all files whose path (including filename) contains `notes` are shown

#### Scenario: Empty query shows all files
- **WHEN** the search input is empty
- **THEN** all vault files are shown (no filtering)
