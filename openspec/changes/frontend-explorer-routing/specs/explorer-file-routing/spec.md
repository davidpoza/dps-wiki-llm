## ADDED Requirements

### Requirement: File path reflected in URL
The system SHALL update the browser URL to `/explorer/<file-path>` whenever a file is selected in the explorer tree, where `<file-path>` is the full relative path of the file (e.g., `carpeta/doc.md`).

#### Scenario: Selecting a file updates the URL
- **WHEN** the user clicks a file node in the explorer tree
- **THEN** the browser URL changes to `/explorer/<file-path>` without a full page reload

#### Scenario: Selecting a folder does not update the URL
- **WHEN** the user clicks a folder node in the explorer tree
- **THEN** the browser URL remains unchanged

### Requirement: Deep-link to a file via URL
The system SHALL automatically load and display the file corresponding to the URL when the user navigates directly to `/explorer/<file-path>`.

#### Scenario: Loading a valid file via direct URL
- **WHEN** the user navigates directly to `/explorer/carpeta/doc.md`
- **THEN** the explorer opens with `carpeta/doc.md` loaded in the editor and the corresponding tree node highlighted

#### Scenario: Loading a non-existent file via direct URL
- **WHEN** the user navigates directly to `/explorer/no-existe.md` and the file does not exist
- **THEN** the explorer shows an error message and no file is loaded in the editor

### Requirement: Browser back/forward navigation
The system SHALL support browser history navigation so that using the back and forward buttons moves between previously visited files.

#### Scenario: Back button returns to previous file
- **WHEN** the user opens file A, then opens file B, then presses the browser back button
- **THEN** the URL returns to `/explorer/<file-A-path>` and file A is loaded in the editor

#### Scenario: Back button from file to empty explorer
- **WHEN** the user navigates to `/explorer` (no file), then opens a file, then presses the browser back button
- **THEN** the URL returns to `/explorer` and the editor panel shows the placeholder message

### Requirement: Unsaved changes guard on file switch
The system SHALL warn the user about unsaved changes when switching between files using the tree or the browser back/forward buttons.

#### Scenario: Switching file with unsaved changes (confirm)
- **WHEN** the user has unsaved changes in the current file and selects a different file from the tree
- **THEN** a confirmation dialog appears asking whether to discard changes; if confirmed, navigation proceeds and changes are discarded

#### Scenario: Switching file with unsaved changes (cancel)
- **WHEN** the user has unsaved changes in the current file and selects a different file from the tree
- **THEN** a confirmation dialog appears; if cancelled, the URL and editor remain unchanged

### Requirement: Base explorer route without file
The system SHALL display the explorer with an empty editor panel (placeholder) when the user navigates to `/explorer` with no file path.

#### Scenario: Navigating to /explorer shows empty editor
- **WHEN** the user navigates to `/explorer`
- **THEN** the file tree is displayed, no file is loaded, and the editor panel shows the "select a file" placeholder
