## Why

Notes created manually or imported from outside the ingest pipeline lack the LLM-generated `summary` section and frontmatter `keywords` that power link discovery and semantic search. Users currently have no way to enrich an existing note without re-running a full ingest job.

## What Changes

- Add an **ENRICH** button to the editor toolbar in the Explorer view.
- Clicking ENRICH sends the current note content to a new backend endpoint that runs LLM enrichment (reusing the `source-note-system` prompt logic).
- The backend returns a `summary` string and a `keywords` list.
- The frontend applies the result in-editor:
  - Inserts a `## Summary` section (with the LLM summary) immediately after the frontmatter block if the note does not already have one.
  - Merges the returned keywords into the frontmatter `keywords` field, replacing any existing value.
- The editor is marked dirty so the user can review before saving.
- Button shows a loading spinner during the LLM call; errors surface as a toast.
- New i18n keys added to both `es.json` and `en.json`.

## Capabilities

### New Capabilities
- `note-enrich`: Backend endpoint `POST /api/files/enrich?path=<path>` that reads file content, calls the LLM with the `source-note-system` prompt, and returns `{ summary, keywords }`. Frontend button wires to this endpoint and applies the result to the live editor state.

### Modified Capabilities

## Impact

- **Backend**: New `enrich` method in `FileController` (or a dedicated `EnrichController`); new `NoteEnrichService` that reuses `SourceNoteLlmService` logic; new DTO `EnrichResultDto`.
- **Frontend**: `ExplorerComponent` gains an `enrich()` method and loading state; `ApiService` gains `enrichNote(path)` method.
- **i18n**: New keys under `explorer.enrich*` in `es.json` and `en.json`.
- **No new prompt key needed**: reuses existing `source-note-system` prompt from `PromptService`.
