## 1. Backend — repository single-document methods

- [x] 1.1 Add `upsertDocument(DocumentRecord doc)` to `DocumentIndexRepository` + `JdbcDocumentIndexRepository`, reusing the existing `INSERT ... ON CONFLICT (path) DO UPDATE` used by `replaceDocuments`.
- [x] 1.2 Add `deleteDocument(String path)` (`DELETE FROM documents WHERE path = ?`) to the interface and JDBC implementation.

## 2. Backend — single-file indexing service

- [x] 2.1 Extract the `DocumentRecord`-from-file logic in `ReindexService.readDocument` (parse via `MarkdownService`, title/doc_type inference, deterministic UUID) into a shared helper so bulk reindex and single-file indexing use the same derivation.
- [x] 2.2 Add `DocumentIndexService` with `indexFile(relativePath)` (build record + `upsertDocument`) and `removeFromIndex(relativePath)` (`deleteDocument`), skipping non-`wiki/**` or non-`.md` paths.

## 3. Backend — hook indexing into note mutations

- [x] 3.1 In `FileService.saveContent`, call `indexFile(path)` after the local write succeeds (before/independent of the WebDAV push).
- [x] 3.2 In `FileService.createFile`, call `indexFile(path)`.
- [x] 3.3 In `FileService.deleteFile`, call `removeFromIndex(path)`.
- [x] 3.4 In `FileService.renameFile` and `moveFile`, call `removeFromIndex(oldPath)` then `indexFile(newPath)`.

## 4. Frontend — search by content in the modal

- [x] 4.1 Replace the tree-flatten/filename filter in `global-search-modal.component.ts` with a debounced (~200 ms) call to `api.lookupFiles(query, limit)`; clear results on empty query.
- [x] 4.2 Render each result with its full path plus a short content snippet computed client-side from `SearchResult.body` around the matched term; preserve keyboard navigation and the existing select/navigate + unsaved-changes behavior.

## 5. Verification

- [x] 5.1 Backend tests: saving a note upserts its `documents` row; delete removes it; rename/move remove old + upsert new; non-wiki/non-md saves are skipped.
- [ ] 5.2 Manual/E2E: edit a note to add a unique phrase, save, open Ctrl+P, search the phrase → the note appears without running a reindex; deleted/renamed notes no longer appear under their old path. (Requires the live stack — not run in this session.)
- [x] 5.3 Confirm ingest and Settings reindex still rebuild the index (no regression) and that a content query matches text found only in a note body.
