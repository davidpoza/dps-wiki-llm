# frontend-experience Specification

## Purpose
TBD - created by archiving change spring-angular-migration. Update Purpose after archive.
## Requirements
### Requirement: Responsive PrimeNG application

The system SHALL provide an Angular 21 + PrimeNG frontend, built with signal-based state, that is fully responsive and renders correctly on mobile viewports.

#### Scenario: Mobile rendering

- **WHEN** a user opens the app on a mobile-sized viewport
- **THEN** all primary views (job viewer, chat, ingest, review) render usable layouts without horizontal overflow

### Requirement: Job viewer with phases, file traversal, and errors

The system SHALL display each job's lifecycle phases in real time over SSE, including the sequence of files the job reads, creates, or updates, and SHALL surface any error with its message.

#### Scenario: Live job phases and files

- **WHEN** a job runs while the viewer is open
- **THEN** the viewer shows each phase transition, lists the files touched as they are processed, and shows a terminal success or error state

### Requirement: Multi-format ingest UI

The system SHALL let a user start an ingest from a markdown file upload or a link/URL, choosing `unattended` or `validated` mode. PDF upload is deferred to a later change.

#### Scenario: Ingest a markdown file

- **WHEN** a user uploads a markdown file and starts an ingest
- **THEN** the system enqueues an ingest job and streams its progress

#### Scenario: Ingest a link

- **WHEN** a user submits a URL and starts an ingest
- **THEN** the system fetches the link content into `raw/**` and enqueues an ingest job

### Requirement: Guided connection review UI

The system SHALL, for a job awaiting review, present discovered connections as an accept/reject checkbox list plus a lexical search box to manually select additional notes to connect, and submit the decision to apply the accepted connections directly to the knowledge files.

#### Scenario: Review and apply connections

- **WHEN** a job is awaiting review
- **THEN** the UI shows candidate connections as checkboxes and a manual file-search box, and submitting applies the chosen set and streams the resulting progress

### Requirement: Chat over the knowledge base

The system SHALL provide a chat interface that submits a question, streams the answer job's progress, and displays the synthesized answer with its evidence references.

#### Scenario: Ask a question

- **WHEN** a user submits a question in the chat
- **THEN** the system enqueues an answer job, streams progress, and shows the answer with its evidence document references

### Requirement: Revert a job from the UI

The system SHALL let a user revert a completed job from the UI and show the outcome, including any conflict that prevents an automatic revert.

#### Scenario: Revert action

- **WHEN** a user reverts a job
- **THEN** the UI shows revert progress and either success or the reported conflict

### Requirement: Global typography
The application body font-family SHALL include explicit emoji font fallbacks — `"Apple Color Emoji"`, `"Segoe UI Emoji"`, `"Noto Color Emoji"`, `"Segoe UI Symbol"` — appended after the existing sans-serif stack, so that all text elements in the application inherit correct emoji resolution without per-component CSS changes.

#### Scenario: Font stack resolves emoji on macOS
- **WHEN** the browser renders any text node containing an emoji code point on macOS
- **THEN** the browser SHALL select `Apple Color Emoji` from the font-family stack for that glyph

#### Scenario: Font stack resolves emoji on Windows
- **WHEN** the browser renders any text node containing an emoji code point on Windows
- **THEN** the browser SHALL select `Segoe UI Emoji` from the font-family stack for that glyph

#### Scenario: Font stack resolves emoji on Linux (with web font)
- **WHEN** the browser renders any text node containing an emoji code point on Linux after `Noto Color Emoji` has loaded
- **THEN** the browser SHALL select `Noto Color Emoji` for that glyph

#### Scenario: Non-emoji text is unaffected
- **WHEN** the browser renders Latin or other non-emoji text
- **THEN** the primary `Inter` typeface SHALL be used, unchanged from the current behaviour

