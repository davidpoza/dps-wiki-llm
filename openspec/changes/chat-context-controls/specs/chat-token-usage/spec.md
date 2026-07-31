## ADDED Requirements

### Requirement: Token usage is captured and persisted for each chat turn

The chat pipeline SHALL open a token-accounting context (`JobTokenAccounting`) around the synchronous LLM call so that the usage reported by the LLM provider is attributed to the turn instead of being discarded. The prompt, completion, and total token counts SHALL be persisted on the assistant `ChatMessage`. When the provider reports no usage, the counts SHALL be recorded as zero and MUST NOT fail the answer.

#### Scenario: Token counts recorded on the assistant message
- **WHEN** a chat turn completes and the LLM provider returns a usage block
- **THEN** the assistant message persists the prompt, completion, and total token counts from that turn

#### Scenario: Missing usage does not fail the turn
- **WHEN** the LLM provider omits the usage block
- **THEN** the assistant message records zero token counts and the answer is still returned successfully

### Requirement: Token usage is exposed via the API and displayed in the UI

The send-message response and the session-detail payload SHALL include per-assistant-message token counts. The chat UI SHALL display the token cost of each answer and the cumulative token total for the active session.

#### Scenario: Per-message token badge
- **WHEN** an assistant message with recorded token usage is shown
- **THEN** the UI displays that message's total token count

#### Scenario: Cumulative session total
- **WHEN** a session contains multiple assistant messages with token usage
- **THEN** the UI displays the sum of tokens across the session
