## Why

Today the interactive chat (`ChatSessionService`) retrieves only the top-5 whole notes most similar to the *current* message, concatenates them under a hard 6.000-character cap, and answers — but it never tells the user **which notes were used** nor **how many tokens the turn cost** (token accounting is captured by `JobTokenAccounting` only for background jobs, so for chat `record()` is a no-op and the data is discarded). It also ignores the vault's densest signal: the `[[wikilinks]]` between notes. Related context that lives one hop away (e.g. the note that defines a term the hit references) is invisible to retrieval. We want the chat to optionally pull in linked notes, and to make the whole context-building process observable and configurable from the UI.

## What Changes

- **Linked-note context expansion**: after semantic retrieval, follow `[[wikilinks]]` from the hits (via the existing `WikiLinkResolver`) up to a configurable depth. Candidate neighbours are **ranked by relevance to the query** and included greedily under a token/character budget — not a naive breadth-first inclusion — to avoid context explosion and relevance dilution.
- **Sources in the chat**: persist and return, per assistant message, the notes that were loaded into context (path + similarity score + whether it was a direct hit or a linked note at depth N). The chat UI shows a "Fuentes" list under each answer.
- **Token spend in the chat**: open a `JobTokenAccounting` context around the synchronous chat turn, persist `promptTokens`/`completionTokens`/`totalTokens` on the assistant `ChatMessage`, return them in the DTO, and show per-turn and per-session totals in the UI.
- **New Settings tab "Chat"**: a dedicated tab (alongside "Datos" and "Prompts") to configure top-K, expansion on/off, max depth, max linked notes, and the context token/character budget. Values are persisted as `AppSetting` key-value rows and read by the chat pipeline at request time.
- No change to the Telegram `AnswerPipelineService` job path.

## Capabilities

### New Capabilities
- `chat-linked-context-expansion`: budget-bounded, query-ranked expansion of chat retrieval context by following `[[wikilinks]]` up to a configurable depth.
- `chat-context-sources`: per-assistant-message record and display of the notes loaded into context, with score and provenance (direct hit vs. linked depth N).
- `chat-token-usage`: capture, persistence, and display of LLM token spend per chat message and cumulative per session.
- `chat-context-settings`: a dedicated Settings tab and persisted configuration governing chat retrieval, link expansion, and context budget.

### Modified Capabilities
- `chat-direct-answer`: the synchronous answer pipeline's context-building step now expands via links, is driven by persisted configuration, and records both the sources used and the token usage; the `POST /api/chat/sessions/{id}/messages` response and session-detail payload gain source and token fields.
- `settings-tabs-layout`: a third tab ("Chat") is added to the Settings screen.

## Impact

- **Backend**
  - `ChatSessionService` (context build), `ChatSessionController` / `SettingsController` (new config endpoints), new `ChatContextService` (link expansion + ranking + budget), `ChatContextSettings` (config accessor over `AppSettingRepository`).
  - Reuse: `WikiLinkResolver`, `SemanticSearchService`/`EmbeddingClient` (for ranking neighbours), `JobTokenAccounting`, `DocumentIndexRepository` (fetch note bodies by path — new lookup method).
  - Domain/DTO: `ChatMessage` entity gains token columns and a persisted list of context sources; `ChatMessageDto` / `ChatSessionDetailDto` expose them.
  - DB migration (next is `V42`): add token columns + a `chat_message_sources` table (or JSON column) to `chat_messages`.
- **Frontend**
  - `chat.component.ts`: render "Fuentes" and token badges; `types.ts` + `chat-session.service.ts` gain the new fields.
  - `settings.component.ts`: new "Chat" tab; `api.service.ts` gains GET/PUT for the chat config.
- **Non-goals (explicitly out of scope)**: document chunking and conversation-aware query rewriting — noted as future work; retrieval still operates over whole notes.
