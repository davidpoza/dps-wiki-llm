## Why

Many notes under `wiki/concepts` and `wiki/sources` have no `keywords` field in their frontmatter, which weakens semantic search and discoverability. There is currently no way to backfill keywords across the existing vault — they are only produced during fresh source ingestion. We need a one-click, observable batch operation to fill the gap for notes already in the vault.

## What Changes

- Add a **"Generar keywords"** button to the Configuración (Settings) screen.
- The button starts an **asynchronous** backend process streamed over **SSE**, showing real-time progress (mirroring the existing "Reindexar" flow).
- The process scans every `.md` note under `wiki/concepts` and `wiki/sources`.
- For each note **without** a `keywords` frontmatter field, it calls the LLM to generate 5–15 keywords and writes them into the frontmatter. Notes that already have `keywords` are skipped (idempotent).
- Keyword input text is taken from the note's **`Summary`** section; if there is no `Summary`, the full note body is used **excluding** the `Sources`, `Related`, and `Links` sections.
- Keyword writes are minimal frontmatter edits (no section re-ordering) and go through the normal save path so they are versioned in history and replicated to WebDAV.

## Capabilities

### New Capabilities
- `keyword-generation`: Batch generation of frontmatter `keywords` for existing `wiki/concepts` and `wiki/sources` notes, triggered from Settings and streamed via SSE with real-time progress.

### Modified Capabilities
<!-- None: this is additive. The reindex/settings SSE flow is reused as a pattern, not modified. -->

## Impact

- **Backend**
  - `SettingsController`: new `GET /settings/keywords/generate` SSE endpoint.
  - New `KeywordGenerationService` (scan → select text → LLM → write).
  - New progress DTO (`KeywordGenerationProgress`).
  - New `MarkdownService` helper for minimal frontmatter `keywords` injection.
  - New Flyway migration seeding a `keywords-system` LLM prompt (next version, `V23`).
  - Reuses `LlmClient`, `PromptService`, `RetryingLlmExecutor`, `JsonExtractionService`, `FileService.saveContent`, `VaultPathResolver`.
- **Frontend**
  - `ApiService`: new `generateKeywords()` EventSource stream + `KeywordGenerationProgress` type.
  - `SettingsComponent`: new "Generar keywords" section with button, live progress, and completion/error feedback.
- **Data**: mutates frontmatter of existing vault notes (adds `keywords`); replicated to WebDAV and recorded in file history.
