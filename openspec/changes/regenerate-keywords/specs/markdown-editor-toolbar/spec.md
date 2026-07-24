## MODIFIED Requirements

### Requirement: Editor header action buttons

The editor header SHALL display action buttons for the currently open file. Buttons SHALL be arranged in a horizontal row to the right of the file title. The row SHALL contain the Save button, the Generate PDF button, and — when the open note is under `wiki/concepts` or `wiki/sources` — the Regenerate Keywords button.

#### Scenario: Save button present

- **WHEN** a file is open in the editor
- **THEN** the Save button SHALL be visible and disabled when the file has no unsaved changes

#### Scenario: PDF button present alongside Save

- **WHEN** a file is open in the editor
- **THEN** the Generate PDF button SHALL be visible immediately adjacent to the Save button

#### Scenario: Regenerate keywords button present for eligible notes

- **WHEN** a file under `wiki/concepts` or `wiki/sources` is open in the editor
- **THEN** the "Regenerar keywords" button SHALL be visible in the toolbar alongside the other action buttons

#### Scenario: Regenerate keywords button absent for non-eligible notes

- **WHEN** a file outside `wiki/concepts` and `wiki/sources` is open in the editor
- **THEN** the "Regenerar keywords" button SHALL NOT be visible

#### Scenario: No file open

- **WHEN** no file is selected
- **THEN** neither the Save button, nor the Generate PDF button, nor the Regenerate Keywords button SHALL be visible
