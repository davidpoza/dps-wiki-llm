## ADDED Requirements

### Requirement: Jobs view SHALL NOT cause horizontal scroll on mobile
The jobs viewer SHALL fit within the viewport width on mobile screens. Long text content (job IDs, file paths, phase messages, concept titles) SHALL be truncated with an ellipsis rather than expanding the layout beyond the screen width.

#### Scenario: Long file path displayed in file entry
- **WHEN** a job contains a file entry with a path longer than the available width
- **THEN** the path SHALL be truncated with `...` and SHALL NOT cause the card or page to scroll horizontally

#### Scenario: Long job ID displayed
- **WHEN** a job has a UUID or long identifier
- **THEN** the job ID SHALL truncate with `...` and SHALL NOT overflow its container

#### Scenario: Long phase message displayed
- **WHEN** a job phase has a message longer than the available width
- **THEN** the phase message SHALL truncate with `...` and SHALL NOT overflow its container

#### Scenario: Long concept title displayed
- **WHEN** a concept proposal has a long proposed title
- **THEN** the title SHALL truncate with `...` and SHALL NOT cause horizontal overflow
