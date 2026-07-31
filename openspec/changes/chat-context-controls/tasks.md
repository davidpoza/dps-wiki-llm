## 1. Persistence & data model

- [x] 1.1 Add migration `V42__chat_message_context.sql`: add `prompt_tokens`, `completion_tokens`, `total_tokens` (bigint, not null, default 0) and `sources` (jsonb, not null, default `'[]'`) to `chat_messages`.
- [x] 1.2 Extend the `ChatMessage` domain entity with the token fields and a persisted `sources` list (JSON-mapped), preserving the existing constructor for user messages.
- [x] 1.3 Add a `ContextSource` value type `(path, score, provenance, depth)` where provenance ∈ {DIRECT, LINKED}.

## 2. Chat context configuration

- [x] 2.1 Add `ChatContextSettings` service reading `chat.top-k`, `chat.expansion-enabled`, `chat.max-depth`, `chat.max-linked-notes`, `chat.context-budget-chars` from `AppSettingRepository` with defaults matching current behavior (top-K=5, expansion off, budget=6000).
- [x] 2.2 Add `ChatContextSettingsDto` and GET/PUT `/api/settings/chat-context` to `SettingsController`, with per-field range validation returning 400 on invalid values.
- [x] 2.3 Unit-test defaults-when-unset, persistence round-trip, and validation rejection.

## 3. Retrieval & link expansion

- [x] 3.1 Add a repository method to fetch document bodies by path (batch) and a method to score candidate paths against a query embedding (reuse pgvector, mirror `semanticSearch`).
- [x] 3.2 Implement `ChatContextService.build(question, settings)`: semantic top-K retrieval → BFS over resolved `[[wikilinks]]` (via `WikiLinkResolver`) up to `maxDepth`, excluding direct hits and visited notes.
- [x] 3.3 Rank linked candidates by cosine similarity to the query embedding; assemble context as direct hits first, then linked candidates by descending score, until `context-budget-chars` or `maxLinkedNotes` is reached.
- [x] 3.4 Return `{ contextText, List<ContextSource> sources }`; when expansion is disabled, behavior matches the current top-K + char-budget path.
- [x] 3.5 Unit-test: expansion off = unchanged; depth-1 inclusion; broken/duplicate links skipped; budget and `maxLinkedNotes` respected; direct hits prioritized.

## 4. Wire chat pipeline (tokens + sources)

- [x] 4.1 In `ChatSessionService.addMessage`, replace `buildKbContext` with `ChatContextService`; keep the existing history-window logic.
- [x] 4.2 Wrap the `llmClient.chat` call in `tokenAccounting.open()`/`close()` (try/finally) and read `snapshot()` after the call.
- [x] 4.3 Persist the assistant `ChatMessage` with the token counts and the `sources` from `ChatContextService`.
- [x] 4.4 Extend `ChatMessageDto` (and therefore `ChatSessionDetailDto`) to expose `sources` and token counts; update `from(...)`.
- [x] 4.5 Integration-test the endpoint: response carries sources + token counts; sources persist across `GET /api/chat/sessions/{id}`; empty-KB → empty sources; blank content → 400.

## 5. Frontend — chat display

- [x] 5.1 Extend `types.ts` `ChatMessage` with `sources` and token fields; update `chat-session.service.ts` typings.
- [x] 5.2 In `chat.component.ts`, render a "Fuentes" list under each assistant message, marking linked sources (with depth) distinctly from direct hits.
- [x] 5.3 Show a per-message token badge and a cumulative session token total.

## 6. Frontend — Chat settings tab

- [x] 6.1 Add GET/PUT `chat-context` methods + types to `api.service.ts`.
- [x] 6.2 Add a "Chat" `p-tab`/`p-tabpanel` to `settings.component.ts` with controls for top-K, expansion toggle, max depth, max linked notes, and context budget, following the existing section/save-feedback pattern.
- [x] 6.3 Load current config on init; save via API with success/error feedback; disable expansion parameters when expansion is off.

## 7. Verification

- [x] 7.1 `mvn -q -pl backend test` (or module test task) passes; `V42` migration applies cleanly on an existing DB. — Full suite green (216 tests, 0 failures); `DpsWikiLlmApplicationTests` context-load ran Flyway incl. V42 without error.
- [ ] 7.2 Build the frontend; manually verify (admin/admin) a chat turn shows Fuentes + token counts, and that toggling expansion/depth in the Chat tab changes which sources appear. — Frontend `ng build` passes cleanly; **live LLM walkthrough pending** (needs running backend + embeddings + LLM endpoint).
- [x] 7.3 Confirm the Telegram `AnswerPipelineService` path is untouched and still works. — `AnswerPipelineService`/`WikiBotService` unchanged; their tests pass.
