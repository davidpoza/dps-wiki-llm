## ADDED Requirements

### Requirement: Editor header action buttons
The editor header SHALL display action buttons for the currently open file. Buttons SHALL be arranged in a horizontal row to the right of the file title. The row SHALL contain the Save button and the Generate PDF button side by side.

#### Scenario: Save button present
- **WHEN** a file is open in the editor
- **THEN** the Save button SHALL be visible and disabled when the file has no unsaved changes

#### Scenario: PDF button present alongside Save
- **WHEN** a file is open in the editor
- **THEN** the Generate PDF button SHALL be visible immediately adjacent to the Save button

#### Scenario: No file open
- **WHEN** no file is selected
- **THEN** neither the Save button nor the Generate PDF button SHALL be visible
