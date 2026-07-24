## Why

`ConceptDedupScanService.scan()` determines which concept files have embeddings by collecting paths that appear in similar-pair results. A concept with an embedding but no partner above the 0.88 similarity threshold never appears in any pair, so it gets incorrectly flagged as "missing embedding". This produces false `concept-dedup-warning` events that alarm the user for notes that are fully indexed. Additionally, the scan sometimes aborts mid-run when the SSE connection drops or the LLM judge call times out without graceful recovery.

## What Changes

- Replace the indirect "infer embedding presence from similar pairs" logic with a direct repository query that fetches concept paths that actually have an embedding row in `document_embeddings`.
- Add `findEmbeddedPathsByDocType(String model, String docType)` (or equivalent) to `DocumentIndexRepository` so the scan can compare all concept paths against the set of paths with real embeddings.
- Fix the intermittent scan failure caused by `emitProgress` throwing `IllegalStateException` (SSE disconnect) propagating through `scan()` and aborting it; progress errors should not stop the scan.

## Capabilities

### New Capabilities
<!-- none -->

### Modified Capabilities
- `concept-semantic-dedup`: The dedup scan's per-document embedding status check now queries the database directly instead of inferring from pairs; the `concept-dedup-warning` event is only emitted for documents that genuinely lack an embedding row.

## Impact

- `ConceptDedupScanService` — rewrite the embedding-status check (~10 lines).
- `DocumentIndexRepository` + `JdbcDocumentIndexRepository` — new query method `findEmbeddedPathsByDocType`.
- `ConceptDedupController.emitProgress` — wrap SSE-send failures so they don't propagate into `scan()`.
- No API contract change; no schema change.
