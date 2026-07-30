## Why

The global search modal (Ctrl+P) does not search note **content** — it loads the file tree and filters client-side by filename/path only (`global-search-modal.component.ts`). A backend content index already exists (`documents.body` with trigram GIN indexes, exposed via `GET /api/files/lookup` → `lexicalLookup`), but the modal never uses it. On top of that, the index only stays fresh on ingest and on the Settings reindex; **saving a note in the editor never updates the index**, so content search would return stale bodies and miss edits. Users expect to find notes by what is written inside them, kept up to date as they edit.

## What Changes

- **Search by content**: the global search modal SHALL query the backend content index (title + path + **body**) instead of filtering filenames client-side, so a query matches text inside notes. Results keep showing the full path and add a short content snippet around the match.
- **Index on save**: `FileService.saveContent` SHALL update the `documents` index for the saved note (incremental single-document upsert), so edits are searchable immediately without a full reindex.
- **Index consistency on other note mutations**: create / delete / rename / move SHALL keep the index in sync (upsert on create/rename target, remove on delete, remove-old + upsert-new on rename/move) so search never returns deleted or renamed-away paths.
- **Ingest and Settings reindex unchanged**: both already index content via `reindexService.reindexWiki()` (full rebuild); they continue to satisfy the "index on ingest" and "index on Settings reindex" requirements. This change adds the missing per-note trigger and wires the UI to the index.

Non-goals: recomputing semantic **embeddings** on save (those remain maintained by ingest / `embedIncremental`); changing the ranking algorithm; full-text ranking beyond the existing trigram similarity.

## Capabilities

### New Capabilities
- `note-content-indexing`: incremental maintenance of the document content index on note mutations — upsert on save/create, remove on delete, remove+upsert on rename/move — so lexical content search reflects the current vault without a full reindex.

### Modified Capabilities
- `global-search-modal`: the modal SHALL search note **content** through the backend content index (server query on body, debounced) rather than client-side filename filtering, while preserving filename/path matching, keyboard navigation, and existing open/navigate behavior.

## Impact

- **Backend**: `FileService` (save/create/delete/rename/move) gains index-update calls via a small indexing service; `DocumentIndexRepository` gains single-document `upsert`/`delete` methods (existing bulk `replaceDocuments` unchanged). Reuses `MarkdownService` to derive title/doc_type/body as `ReindexService` does. No schema migration required (uses existing `documents` table + trigram indexes).
- **API**: reuses existing `GET /api/files/lookup?q=&limit=` (currently only consumed by `review.component.ts`); no new endpoint required.
- **Frontend**: `global-search-modal.component.ts` switches from tree-filtering to a debounced call to `api.lookupFiles(...)`; renders content snippet + full path. `global-search.service.ts` unchanged.
- **Performance**: per-note upsert replaces implicit dependence on full reindex for freshness; save latency gains one indexed DB upsert.
