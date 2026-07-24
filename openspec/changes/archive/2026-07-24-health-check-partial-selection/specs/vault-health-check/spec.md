## MODIFIED Requirements

### Requirement: Health Check action in Settings

The system SHALL provide a "Health Check" section in the Settings screen with two controls:
1. A primary button "Lanzar Health Check" that launches the full vault reconciliation process and displays its live progress and final result inline.
2. A secondary button "Seleccionar notas…" that opens a file-selection modal for running the Health Check on a subset of notes.

#### Scenario: Launching the full health check

- **WHEN** the user clicks the "Lanzar Health Check" button in Settings
- **THEN** the system starts the full reconciliation process over the entire vault
- **AND** the action is disabled while the process is running to prevent concurrent runs from the same view

#### Scenario: Opening the partial selection modal

- **WHEN** the user clicks "Seleccionar notas…" in the Health Check section
- **THEN** a file-selection modal opens showing notes from `wiki/concepts` and `wiki/sources`

#### Scenario: Idle state before running

- **WHEN** the Settings screen is opened and the health check has not been run
- **THEN** the Health Check section shows both buttons enabled and no progress indicator
