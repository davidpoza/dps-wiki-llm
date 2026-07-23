# chat-session-vault-export Specification

## Purpose
TBD - created by archiving change knowledge-chat-sessions. Update Purpose after archive.
## Requirements
### Requirement: User can export a chat session to the vault as a markdown note
The system SHALL allow the user to trigger the export of a chat session to the vault via a button in the UI. The export is optional and explicitly initiated by the user — it is NOT automatic.

The endpoint `POST /api/chat/sessions/{id}/export-to-vault` creates a markdown file in the vault under `outputs/chat-{date}-{title-slug}.md` with the full conversation formatted as Q&A blocks.

#### Scenario: Export button triggers vault file creation
- **WHEN** the user clicks "Guardar en vault" on a session
- **THEN** the system creates a markdown file in the vault with the conversation content and returns the file path

#### Scenario: Exported file format
- **WHEN** a session is exported
- **THEN** the resulting markdown file MUST contain: a title heading (`# Chat: {session title}`), a creation date, and each message as a labeled block (`**Usuario:**` / `**Asistente:**`) in chronological order

#### Scenario: Export of empty session is rejected
- **WHEN** the user attempts to export a session with no messages
- **THEN** the system returns 400 Bad Request

#### Scenario: Re-export overwrites previous file
- **WHEN** the user exports the same session a second time
- **THEN** the system overwrites the previously exported file (same deterministic path) rather than creating a duplicate

### Requirement: Export button shows feedback to the user
The system SHALL show the user whether the export succeeded (with the vault path) or failed.

#### Scenario: Successful export shows file path
- **WHEN** the export completes successfully
- **THEN** the UI displays the vault path of the created file as confirmation

#### Scenario: Failed export shows error
- **WHEN** the export fails (e.g., filesystem error)
- **THEN** the UI displays an error message

