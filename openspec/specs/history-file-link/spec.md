# history-file-link Specification

## Purpose
TBD - created by archiving change history-file-open-in-editor. Update Purpose after archive.
## Requirements
### Requirement: File path in history entry is a clickable link
Each entry in the change history list SHALL display the file path as an interactive element that navigates to the file in the markdown editor when clicked.

#### Scenario: User clicks file path in a history entry
- **WHEN** the user clicks the file path text in any change history row
- **THEN** the app navigates to `/explorer/<path>`, opening that file in the editor

#### Scenario: File path retains its visual position in the row
- **WHEN** the history list renders
- **THEN** the file path link occupies the same flex slot as before (flex: 1, truncated with ellipsis), with a pointer cursor and primary-color text to signal interactivity

