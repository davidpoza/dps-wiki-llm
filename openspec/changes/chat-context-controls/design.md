## Context

The interactive chat is served by `ChatSessionService.addMessage` → `buildPrompt`:

1. `semanticSearch.search(question, TOP_K=5)` embeds **only the current message** and runs a pgvector cosine search over `document_embeddings` joined to `documents`. Notes are indexed and embedded **as whole documents** (no chunking).
2. `buildKbContext` concatenates hits as `### {path}\n{body}` with a hard `MAX_KB_CONTEXT_CHARS = 6000` cut.
3. Windowed history (`MAX_HISTORY_CHARS = 6000`) + the KB context go to `llmClient.chat`.

Relevant existing building blocks to reuse:
- `WikiLinkResolver` — collects markdown files, builds a slug index, extracts and resolves `[[links]]` from note bodies. Already the authoritative resolver used by the graph.
- `EmbeddingClient.embedQuery` / `DocumentIndexRepository.semanticSearch` / `computeScore(srcPath, tgtPath)` — for scoring candidate neighbours against the query and each other.
- `JobTokenAccounting` (ThreadLocal) + `OpenAiCompatibleLlmClient.recordUsage` — already parse the provider `usage` block; the context is only `open()`ed by `JobConsumers`, so chat currently discards usage.
- `AppSetting` / `AppSettingRepository` — key-value config store; `SettingsController` already exposes GET/PUT pairs (`link.similarity-threshold`, `link.csls-margin`, `link.hubness-k`) with range validation. Migration `V40__job_token_usage.sql` set the precedent for token columns; next migration is `V42`.
- Settings UI: `settings.component.ts` uses `p-tabs` with tabs "Datos" and "Prompts"; `api.service.ts` holds the HTTP methods.

## Goals / Non-Goals

**Goals:**
- Add optional, budget-bounded, query-ranked link expansion to the chat context.
- Persist and surface, per assistant message, the sources loaded into context and the token spend of the turn.
- Make retrieval/expansion/budget configurable from a dedicated "Chat" Settings tab, effective without restart.
- Reuse existing resolver, embedding, token-accounting, and settings infrastructure; keep the change isolated to the interactive chat path.

**Non-Goals:**
- Document **chunking** (retrieval stays whole-note). Noted as future work.
- **Conversation-aware query rewriting** (still embed only the latest message). Future work.
- Any change to the Telegram `AnswerPipelineService` job path.
- Streaming responses / token streaming.

## Decisions

### D1. Extract a `ChatContextService` responsible for building the context packet
`ChatSessionService.buildKbContext` grows into: retrieve → expand via links → rank → budget → assemble, plus emitting the list of chosen sources. Rather than bloat `ChatSessionService`, introduce `ChatContextService` that returns a small result object: `{ contextText, List<ContextSource> sources }`, where `ContextSource = (path, score, provenance, depth)`. `ChatSessionService` consumes it, calls the LLM, and persists sources + tokens.
- *Alternative considered*: inline everything in `ChatSessionService`. Rejected — mixes retrieval policy with session/persistence concerns and is hard to unit-test.

### D2. Ranked + budgeted expansion (not naive BFS)
Expansion walks the link graph breadth-first up to `maxDepth`, collecting a candidate set (excluding direct hits and already-visited). Candidates are scored by cosine similarity of their stored embedding to the **query embedding** (compute the query embedding once; compare via a repository method that scores candidate paths against a query vector, mirroring `semanticSearch`). Assembly order: all direct hits first, then linked candidates in descending score, appending `### {path}\n{body}` until the **character budget** or `maxLinkedNotes` is hit. This bounds context growth and keeps the most relevant neighbours.
- *Alternative considered*: include all neighbours to depth N (pure BFS). Rejected — context explosion (5-10 links/note ⇒ hundreds of notes at depth 2), token waste, and relevance dilution that degrades answers.
- *Alternative considered*: rank by graph proximity/PPR (`MonteCarloPpr`). Deferred — embedding-to-query similarity is more directly tied to the user's question and reuses infra already in the hot path; PPR can be a later ranking option.

### D3. Budget expressed in characters now, surfaced as a single "context budget" setting
Keep the existing char-based cap (`MAX_KB_CONTEXT_CHARS`) as the enforcement mechanism to avoid pulling in a tokenizer, but expose it as a configurable "context budget". Token *reporting* uses the provider's real `usage` counts (accurate), while budget *enforcement* stays char-based (cheap, deterministic).
- *Alternative considered*: enforce a true token budget with a local tokenizer. Deferred — adds a dependency for marginal benefit; provider usage already gives accurate post-hoc token reporting.

### D4. Persistence: token columns + sources on `chat_messages`
Migration `V42` adds `prompt_tokens`, `completion_tokens`, `total_tokens` (nullable, default 0) to `chat_messages`, mirroring `V40`. Sources are stored as a JSON column (`sources jsonb`) on `chat_messages` — ordered list of `{path, score, provenance, depth}`. JSON avoids a child table + join for a read-mostly, always-fetched-with-message payload.
- *Alternative considered*: a `chat_message_sources` child table. Rejected — sources are only ever read together with their message; JSON is simpler and matches the `documents.frontmatter` jsonb precedent.

### D5. Token accounting reuse
Wrap the synchronous turn in `tokenAccounting.open()` / `close()` (try/finally) around the `llmClient.chat` call, then read `snapshot()`. This activates the existing `recordUsage` path for chat with zero client changes. Because chat runs on the request thread, the ThreadLocal is correctly scoped.

### D6. Configuration via `AppSetting` + a `ChatContextSettings` accessor
Add keys under a `chat.*` namespace: `chat.top-k`, `chat.expansion-enabled`, `chat.max-depth`, `chat.max-linked-notes`, `chat.context-budget-chars`. A `ChatContextSettings` service reads them (with defaults) on each request; `SettingsController` gets a GET/PUT pair returning a single `ChatContextSettingsDto` (one round-trip, unlike the per-value pattern used for link settings) with range validation. Frontend adds one "Chat" tab and one GET/PUT in `api.service.ts`.

## Risks / Trade-offs

- **Context explosion / cost blow-up from expansion** → mitigated by D2 (ranking + `maxLinkedNotes` + char budget) and expansion defaulting to **off** so behavior is unchanged until an admin opts in.
- **Extra latency from scoring neighbours** (an embedding query + N similarity comparisons per turn) → query embedding computed once; candidate scoring is a single indexed pgvector query; `maxDepth` defaults to 1 and `maxLinkedNotes` is small.
- **Whole-note inclusion is coarse** (a linked note is included whole or truncated at the budget) → accepted for this change; chunking is the follow-up that makes inclusion surgical.
- **Sources JSON drift** if a note is later renamed/deleted → sources are a historical snapshot of what was used; stale paths are acceptable and simply may not resolve when clicked.
- **Provider omits `usage`** → token counts recorded as zero; never fails the turn (existing `recordUsage` already tolerates this).
- **Migration on an existing `chat_messages` table** → columns are nullable/default 0 and the `sources` column defaults to an empty array, so existing rows remain valid.

## Migration Plan

1. Ship `V42` migration (token columns + `sources jsonb` on `chat_messages`) — additive, no backfill needed.
2. Deploy backend with expansion **disabled by default**; existing chat behavior is preserved (top-K=5, char budget=6000, no links).
3. Deploy frontend; the new "Chat" tab and per-message sources/token badges appear.
4. Rollback: revert app; the additive columns are inert and can be dropped in a follow-up if needed.

## Open Questions

- Should the query embedding used for neighbour ranking be cached per turn beyond the single request? (Assumed no — one request, one embedding.)
- Do we want a per-session or global cumulative token budget/limit enforced (vs. reporting only)? (Assumed reporting only for now.)
- Should source paths in the chat be clickable deep-links to the note viewer? (Assumed nice-to-have; can reuse existing `clickable-note-paths` behavior if cheap.)
