## ADDED Requirements

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
