## Context

`ConceptDedupScanService.scan()` checks whether each concept has an embedding by tracking which paths appear in at least one similar pair returned by `findSimilarPairsByDocType`. A concept that has an embedding but is semantically unique (score < 0.88 to every other concept) never appears in any pair — it gets incorrectly flagged with a `concept-dedup-warning` progress event and shown in the UI as "Sin embedding".

Additionally, the scan phase that calls the LLM judge is fully synchronous and blocking. While a judge call runs, no SSE events are sent to the client. Nginx's `proxy_read_timeout` (default 60 s) or a similar proxy can close the connection if the judge phase goes silent long enough, causing the frontend to show an error even though the scan completed correctly on the server.

## Goals / Non-Goals

**Goals:**
- Emit `concept-dedup-warning` only for concepts that genuinely lack a row in `document_embeddings`.
- Prevent the SSE connection from being silently closed during the judge phase.

**Non-Goals:**
- Changing the dedup algorithm, thresholds, or LLM prompts.
- Making the judge calls truly async / parallel (out of scope; they are sequential by design).
- Changing how the frontend renders warnings.

## Decisions

### 1. Direct DB query for embedding presence
Add `findEmbeddedPathsByDocType(String model, String docType): Set<String>` to `DocumentIndexRepository` / `JdbcDocumentIndexRepository`. The query is a simple JOIN between `documents` and `document_embeddings` filtered by `doc_type` and `model`, returning the set of paths. `ConceptDedupScanService.scan()` calls this once, before the progress loop, and compares each concept's path against the returned set.

**Alternative rejected**: inferring from pairs (current approach) — incorrect by construction; a concept can have an embedding without a similar partner.

### 2. SSE heartbeat during judge calls
Before calling `callJudge(...)`, emit a `concept-dedup-judge` progress event so the client knows processing is ongoing and the proxy timeout resets. The event carries the current group index as `current` and total groups as `total`. This requires threading the `onProgress` consumer into `callJudge` (or wrapping the call site).

**Alternative rejected**: increasing Nginx proxy_read_timeout — touches infrastructure outside this repo and doesn't fix the root cause of silent blocking.

### 3. SSE error isolation in controller
Wrap `emitProgress` in a try-catch so that an `IllegalStateException` (client disconnected) does not propagate into `scan()` and abort the scan itself. If the client is gone, swallow the error and let the scan finish normally.

## Risks / Trade-offs

- [New DB query] `findEmbeddedPathsByDocType` adds one extra query per scan — cheap (indexed JOIN) and called once.
- [Heartbeat] Sends one more SSE event per group during judging — negligible overhead.
- [Error isolation] If the client disconnects, the scan runs to completion even though no one is listening. Acceptable: the scan is not heavy enough to warrant cancellation.
