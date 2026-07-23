## ADDED Requirements

### Requirement: Chat screen has a two-panel layout with session sidebar and message area
The system SHALL restructure the `/chat` route into a two-panel layout: a left sidebar listing past sessions and a main panel showing the active session's messages.

#### Scenario: Sidebar lists past sessions
- **WHEN** the user navigates to `/chat`
- **THEN** the sidebar shows a list of past sessions (title + relative date), ordered most-recent first, and a "Nueva conversación" button at the top

#### Scenario: Clicking a session loads it
- **WHEN** the user clicks a session in the sidebar
- **THEN** the message area renders that session's full message history in chronological order

#### Scenario: New conversation button starts fresh session
- **WHEN** the user clicks "Nueva conversación"
- **THEN** the message area is cleared and a new session is created on the first message sent

#### Scenario: On mobile the sidebar is collapsible
- **WHEN** the screen width is below 768px
- **THEN** the sidebar is hidden by default with a toggle button to open it as an overlay

### Requirement: Messages are displayed as chat bubbles
The system SHALL render user and assistant messages as visually distinct bubbles in the conversation area, similar to a messaging app.

#### Scenario: User message appears right-aligned
- **WHEN** a user message is displayed
- **THEN** it appears right-aligned with a distinct background color

#### Scenario: Assistant message appears left-aligned
- **WHEN** an assistant message is displayed
- **THEN** it appears left-aligned with a neutral background, and its markdown content is rendered (bold, italics, lists, code blocks)

#### Scenario: Thinking indicator while waiting for response
- **WHEN** the user sends a message and the system is generating the response
- **THEN** a typing/loading indicator is shown in the assistant bubble position until the answer arrives

### Requirement: Input area supports sending messages
The system SHALL provide a text input area at the bottom of the message panel with a send button and keyboard shortcut.

#### Scenario: Send via button
- **WHEN** the user types a message and clicks the send button
- **THEN** the message is submitted and the input is cleared

#### Scenario: Send via Ctrl+Enter
- **WHEN** the user types a message and presses Ctrl+Enter
- **THEN** the message is submitted (same as clicking send)

#### Scenario: Input is disabled while waiting for response
- **WHEN** the system is generating an answer
- **THEN** the send button and input are disabled to prevent duplicate submissions

### Requirement: Each session has a "Guardar en vault" action
The system SHALL show a button per session (in the session header or sidebar context menu) that triggers the vault export.

#### Scenario: Export button is visible on active session
- **WHEN** the user is viewing a session with at least one message
- **THEN** a "Guardar en vault" button is visible in the session header area

#### Scenario: Export button is absent on empty session
- **WHEN** the current session has no messages
- **THEN** the "Guardar en vault" button is hidden or disabled
