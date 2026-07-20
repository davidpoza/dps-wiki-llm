## 1. LLM prompt seed

- [x] 1.1 Add Flyway migration `backend/src/main/resources/db/migration/V23__keywords_generation_prompt.sql` inserting prompt key `keywords-system` (Spanish name, e.g. "Generación de keywords (system)") that instructs the model to return ONLY `{"keywords": ["...", ...]}` with 5–15 concise terms and no invented facts
- [x] 1.2 Verify `PromptService` loads the new key on startup (it caches all rows via `findAll()`); no code change expected

## 2. Backend: progress DTO

- [x] 2.1 Add `backend/src/main/java/com/dpswikillm/dto/KeywordGenerationProgress.java` record `(int processed, int total, int updated, int skipped)`

## 3. Backend: minimal frontmatter injection

- [x] 3.1 Add `MarkdownService.injectFrontmatterList(String markdown, String key, List<String> values)` that inserts a YAML list into the existing `---` frontmatter block (before the closing `---`) reusing the existing list/scalar serialization style, leaving the body byte-for-byte unchanged; create a frontmatter block if none exists
- [x] 3.2 Add a unit test asserting the body is unchanged and only `keywords` lines are added (round-trip on a real concept/source note shape)

## 4. Backend: keyword generation service

- [x] 4.1 Add `KeywordGenerationService` that walks `.md` files under `wiki/concepts` and `wiki/sources` via `VaultPathResolver`
- [x] 4.2 For each note: parse with `MarkdownService`; skip (count skipped) if frontmatter already has a non-empty `keywords` field
- [x] 4.3 Select source text: non-blank `Summary` section if present, else the body joined from remaining sections excluding `Sources`, `Related`, `Links`
- [x] 4.4 Generate keywords via `LlmClient.chatJson` + `PromptService.getText("keywords-system")` + `RetryingLlmExecutor.executeParsing` + `JsonExtractionService.extractObject` (validate non-empty `keywords` array; trim/dedupe/drop blanks)
- [x] 4.5 Inject keywords with `injectFrontmatterList` and persist via `FileService.saveContent` (history + WebDAV); count updated
- [x] 4.6 Isolate per-note failures (log, count as skipped, continue); report `KeywordGenerationProgress` through a `Consumer` callback after each note
- [x] 4.7 Add a unit test for scope/idempotency (skips notes with keywords, skips notes outside target folders) and source-text selection (Summary vs. body-minus-excluded)

## 5. Backend: SSE endpoint

- [x] 5.1 Add `GET /settings/keywords/generate` (`produces = TEXT_EVENT_STREAM_VALUE`) to `SettingsController`, mirroring `reindex()`: `SseEmitter(0L)` + `CompletableFuture.runAsync`, emitting `progress`/`done`/`error` events with `KeywordGenerationProgress`
- [x] 5.2 Inject `KeywordGenerationService` into `SettingsController`

## 6. Frontend: API client

- [x] 6.1 Add `KeywordGenerationProgress` interface to `frontend/src/app/services/api.service.ts`
- [x] 6.2 Add `generateKeywords(): Observable<KeywordGenerationProgress>` built on `EventSource` (same `?token=` handling as `reindex()`), emitting `progress`, completing on `done`, erroring on `error`

## 7. Frontend: Settings UI

- [x] 7.1 Add a "Generar keywords" section to `SettingsComponent` (near "Índice del Vault") with a button plus `generating`, `processed`, `total`, `updated`, `skipped`, `done`, `error` signals
- [x] 7.2 Implement `startKeywordGeneration()` subscribing to `api.generateKeywords()`; disable the button while running; show live `processed/total` and a success summary with `updated`/`skipped`; show an error message on failure

## 8. Verification

- [x] 8.1 Run backend tests (`./gradlew test` or project equivalent) and frontend build/lint
- [ ] 8.2 Manually run the flow: click "Generar keywords", confirm SSE progress updates live, that only notes missing `keywords` are updated, that keyword text comes from `Summary` (or body minus excluded sections), and that edited notes show minimal diffs in history and sync to WebDAV
