## Context

The app already has an SSE-driven batch operation triggered from Settings: **Reindexar** (`GET /settings/reindex`). It uses `SseEmitter(0L)` + `CompletableFuture.runAsync`, emits `progress`/`done`/`error` events with a `ReindexProgress(processed, total)` record, and is consumed on the frontend through an `EventSource` wrapped in an RxJS `Observable` (`ApiService.reindex()` + `SettingsComponent.startReindex()`).

Keyword generation should reuse this exact shape so the UX and code stay consistent. The building blocks already exist:

- **LLM**: `LlmClient.chatJson(...)` + `PromptService.getText(key)` + `RetryingLlmExecutor.executeParsing(...)` + `JsonExtractionService.extractObject(...)`, exactly as in `SourceNoteLlmService`.
- **Prompts**: stored in `llm_prompts` (Flyway), cached by `PromptService`. Latest migration is `V22`; source-note prompt already emits `keywords`.
- **Markdown**: `MarkdownService.parse(...)` → `MarkdownDocument(frontmatter, title, sections)`.
- **Persistence**: `FileService.saveContent(relativePath, content)` writes the file, snapshots it for history, and calls `webDavSyncService.pushSaved(...)`.
- **Paths**: `VaultPathResolver.resolve("wiki")` / `.vaultRoot()`.

The project is actively sensitive to diff noise (see the `reduce-diff-noise` change and the "eliminate spurious blank lines" commit), so keyword writes must be minimal.

## Goals / Non-Goals

**Goals:**
- One button in Settings that runs an async, SSE-streamed keyword backfill over `wiki/concepts` and `wiki/sources`.
- Idempotent: only fill `keywords` where missing; safe to re-run.
- Correct source-text selection: `Summary` if present, else full body minus `Sources`/`Related`/`Links`.
- Minimal frontmatter edits (no section reordering, no gratuitous `updated` churn) that still flow through history + WebDAV sync.
- Robust to per-note LLM failures (skip and continue).

**Non-Goals:**
- Regenerating or overwriting keywords that already exist.
- Re-embedding / reindexing as part of this operation (separate existing flow).
- A background job/queue entry (`JobType`) — this is a lightweight request-scoped stream like reindex, not a durable job.
- Editing notes outside `wiki/concepts` and `wiki/sources`.

## Decisions

### 1. Reuse the reindex SSE pattern (not the durable Job queue)
`GET /settings/keywords/generate` returns an `SseEmitter(0L)`; work runs in `CompletableFuture.runAsync`; events `progress` / `done` / `error`. Rationale: matches the sibling "Reindexar" feature the user explicitly referenced, minimal new surface, no job persistence needed. Alternative (enqueue a `Job`) was rejected as over-engineered for an on-demand maintenance action.

### 2. Dedicated progress DTO
Add `KeywordGenerationProgress(int processed, int total, int updated, int skipped)` rather than reusing `ReindexProgress(processed, total)`. Rationale: the user cares about how many notes actually got keywords vs. were skipped; a richer record makes the success summary meaningful. It's a trivial record following the existing DTO convention.

### 3. Minimal frontmatter injection, not `mergeAndRender`
`MarkdownService.mergeAndRender` re-renders the whole document: it reorders sections into `DEFAULT_SECTION_ORDER`, drops unknown-position formatting, and forces an `updated` date. That would produce huge, noisy diffs on every touched note. Instead add a focused helper:

```
String injectFrontmatterList(String markdown, String key, List<String> values)
```

It locates the leading `---\n … \n---\n` block and inserts the `key:` YAML list just before the closing `---`, reusing the same list serialization style already used by `appendFrontmatter` (`key:` then `  - "value"` lines, quoting via the existing scalar rules). If the note has no frontmatter block, one is created containing only the keywords (edge case; both target folders currently always have frontmatter). The body is left byte-for-byte identical. Rationale: keeps diffs to the added lines only, consistent with the project's diff-noise work.

### 4. Source-text selection lives in the service
`KeywordGenerationService` parses each note once via `MarkdownService.parse`. Selection:
- If `sections` contains a non-blank `Summary` → use it verbatim.
- Else → join the remaining sections (in their existing order) as `## <name>\n<content>`, skipping `Sources`, `Related`, and `Links`, optionally prefixed with the title. This mirrors the exclusion list from the requirement literally.

### 5. LLM call shape
New prompt key `keywords-system`, seeded by Flyway `V23__keywords_generation_prompt.sql`. The prompt instructs the model to return **only** a JSON object `{"keywords": ["...", ...]}` with 5–15 concise terms and no invented facts (aligned with the `source-note-system` guidance). The service calls:

```
retrying.executeParsing(() -> {
  String resp = llmClient.chatJson(List.of(
      new ChatMessage("system", promptService.getText("keywords-system")),
      new ChatMessage("user", inputText)));
  return jsonExtractionService.extractObject(resp, json -> nonEmptyArray(json, "keywords"));
});
```

Keywords are read as a string array (dedupe/trim, drop blanks). Reusing `executeParsing` gives free retries on malformed responses, matching `SourceNoteLlmService`.

### 6. Persist through `FileService.saveContent`
Each updated note is written via `fileService.saveContent(relativePath, newContent)` so it gets a history snapshot and WebDAV push for free, rather than writing files directly. Progress is reported after each note (updated or skipped).

### 7. Per-note error isolation
LLM/parse/write failures for one note are caught, logged, counted (as skipped/failed), and the loop continues. Only infrastructure-level failures (e.g., cannot walk the vault) abort the run and emit an `error` event. Rationale: a single bad note should not waste the whole batch.

### 8. Frontend mirrors `reindex()`
`ApiService.generateKeywords()` returns an `Observable<KeywordGenerationProgress>` built on `EventSource` (with the same `?token=` handling as `reindex()`). `SettingsComponent` gets a new "Generar keywords" section next to "Índice del Vault" with a button, live `processed/total` text, and a success line reporting `updated`/`skipped` counts — reusing the existing signal + feedback style.

## Risks / Trade-offs

- **Large vaults → long runs / many LLM calls** → Skip-if-present keeps re-runs cheap; progress is streamed so the user sees liveness; failures are isolated so partial progress is preserved.
- **Frontmatter injection edge cases (no block, unusual YAML)** → Helper handles the no-block case and reuses existing serialization; both target folders currently always have a `---` block. Covered by unit tests over real note shapes.
- **Diff noise if injection is imprecise** → Body is preserved verbatim and only the `keywords` lines are inserted; verified by a round-trip test asserting the body is unchanged.
- **LLM returns off-target or too many/few keywords** → Prompt constrains to 5–15 terms; validation requires a non-empty array; retried on malformed output. Quality is best-effort, acceptable for a backfill.
- **Client navigates away mid-run** → The `EventSource` closes; the server run finishes on its own (best-effort, same as reindex). No durable resume — acceptable for a maintenance action.

## Open Questions

- Should already-touched notes also refresh their `updated` frontmatter date? Current decision: **no** (keep diffs minimal); revisit if downstream tooling relies on `updated`.
- Should there be a server-side guard against two concurrent runs (beyond the disabled button)? Current decision: rely on the UI button state, matching reindex; add a simple in-service `AtomicBoolean` guard only if needed.
