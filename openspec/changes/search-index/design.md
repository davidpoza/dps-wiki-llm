## Context

The content index already exists: a `documents` table (`path`, `title`, `doc_type`, `updated_at`, `body`) with trigram GIN indexes on `path`, `title`, and `body` (migration `V2__documents.sql`). `DocumentIndexRepository.lexicalLookup(query, limit)` already searches all three columns with trigram similarity scoring, and it is exposed as `GET /api/files/lookup?q=&limit=` (`JobController:245`). Today only `review.component.ts` calls it.

Two gaps prevent content search from working as users expect:

1. **The search modal never queries the index.** `global-search-modal.component.ts` loads the file tree (`fileService.getTree()`), flattens it to leaf paths, and filters client-side by the path string only — so it matches filenames, never note bodies.
2. **The index goes stale on edit.** `FileService.saveContent` writes the file and pushes to WebDAV but never touches `documents`. Only two paths refresh the index: ingest (`IngestPipelineService` → `reindexService.reindexWiki()`) and the Settings reindex SSE (`SettingsController` → `reindexService.reindexWiki()`), both full rebuilds. Editor saves, creates, deletes, renames, and moves leave the index unchanged until the next full reindex.

Constraint: keep the existing endpoint, table, and bulk `replaceDocuments` reindex path untouched; add incremental maintenance and wire the UI.

## Goals / Non-Goals

**Goals:**
- Global search matches note **content** (body), plus title/path, via the existing backend index.
- The index reflects a note's current body immediately after it is saved, with no full reindex.
- The index stays consistent for create/delete/rename/move so search never surfaces stale or deleted paths.
- No database migration; reuse `documents` and its trigram indexes.

**Non-Goals:**
- Recomputing semantic **embeddings** on save (they remain maintained by ingest / `embedIncremental`); only the lexical content index is kept fresh here.
- Changing ranking/scoring beyond the existing trigram similarity.
- Reconciling the index for note changes that arrive purely through external WebDAV sync without going through `FileService` (still covered by ingest / Settings reindex).

## Decisions

### Incremental single-document upsert on save (not full reindex)
Saving triggers an upsert of just the saved note's `DocumentRecord`, not `reindexWiki()`. A full reindex walks and re-reads the entire vault — unacceptable per-save cost. Add narrow repository methods:
- `upsertDocument(DocumentRecord doc)` — `INSERT ... ON CONFLICT (path) DO UPDATE` (same upsert already used inside `replaceDocuments`).
- `deleteDocument(String path)` — `DELETE FROM documents WHERE path = ?`.

Bulk `replaceDocuments` (used by `reindexWiki`) is unchanged.

### A small indexing service, called from `FileService`
Introduce `DocumentIndexService` (or fold onto `ReindexService`) with `indexFile(relativePath)` and `removeFromIndex(relativePath)`. It derives the `DocumentRecord` exactly as `ReindexService.readDocument` does today (parse via `MarkdownService`, title fallback from path, `type` frontmatter → `inferDocType`, deterministic `UUID.nameUUIDFromBytes(path)`). To avoid duplication, extract the existing `readDocument` logic into a shared helper reused by both the bulk reindex and single-file indexing.

`FileService` calls it **after the local write succeeds**, matching the durability model (`saveContent` treats the local write + history as durable even if WebDAV replication later fails):
- `saveContent` / `createFile` → `indexFile(path)`
- `deleteFile` → `removeFromIndex(path)`
- `renameFile` / `moveFile` → `removeFromIndex(oldPath)` + `indexFile(newPath)`

Only `wiki/**` markdown notes are indexed, consistent with `ReindexService` (which rejects non-`wiki/` paths and only reads `.md`); non-wiki or non-markdown saves are skipped.

Alternative considered — index inside the controllers: rejected; `FileService` is the single choke point for all mutation entry points (editor, file-tree context menu), so indexing there covers them uniformly.

### Frontend queries the existing endpoint, debounced
`global-search-modal.component.ts` drops the tree-flatten/filter and instead calls `api.lookupFiles(q, limit)` (existing `GET /api/files/lookup`) with a short debounce (~200 ms) as the user types. Results render the full path (existing behavior) plus a short **content snippet** around the match, computed client-side from the `body` already returned by the endpoint (`SearchResult.body`) — no backend change. Empty query clears results. Keyboard navigation and the existing selection/navigation logic (`GlobalSearchService.selectFile`, unsaved-changes confirmation) are preserved.

Alternative considered — server-side snippet/highlight: deferred; the endpoint already returns `body`, so snippets are cheap client-side and keep the API stable.

## Risks / Trade-offs

- **Embeddings lag after a save** → semantic search stays on the last embedded version until the next ingest/`embedIncremental`; acceptable and explicitly out of scope. Lexical content search (the modal) is fresh.
- **Externally-synced changes bypass `FileService`** → notes changed only via WebDAV sync won't be incrementally indexed → mitigated by the existing ingest and Settings full reindex, which reconcile the whole index.
- **Extra work on save** → one indexed upsert on a unique `path`; negligible, and it runs after the durable local write so a failed index update cannot lose the user's edit.
- **Endpoint returns full `body` per result** → cap `limit` (e.g. 10–20) and render only a snippet, so payloads stay small.
- **Logic duplication between bulk and single-file indexing** → mitigated by extracting the shared `readDocument`/record-building helper.

## Migration Plan

No database migration (reuses `documents` + trigram indexes). Deploy backend and frontend together. Rollback is a plain revert: incremental updates stop, but the index is still fully rebuilt on ingest and Settings reindex, so search degrades gracefully to its current freshness rather than breaking.

## Open Questions

- Empty-query UX: show nothing (chosen) vs. recent/most-recently-edited notes — start with nothing, revisit if users want a default list.
- Should a WebDAV-originated remote change eventually trigger targeted reindexing? Out of scope now; note for a future change if drift proves noticeable.
