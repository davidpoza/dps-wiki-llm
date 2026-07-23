## 1. Backend: LLM Service (done)

- [x] 1.1 ~~`EnrichResultDto`~~ — superseded by async approach; deleted
- [x] 1.2 Create `NoteEnrichService` with LLM call via `source-note-system` prompt
- [x] 1.3 `RetryingLlmExecutor` retry logic with `summary` + `keywords` validation
- [x] 1.4 Keyword normalization (lowercase kebab-case)

## 2. Backend: Job Infrastructure

- [x] 2.1 Add `ENRICH` to `JobType` enum
- [x] 2.2 Create `EnrichPipelineService.run(Job)`: captureFile → noteEnrichService.enrich() → markdownService.mergeAndRender() → saveContent() → recordAfter() → finalizeSnapshot(); set `affectedPaths`
- [x] 2.3 Add `ENRICH` case to `JobConsumers.consumeWriteJob()`
- [x] 2.4 Add `POST /api/jobs/enrich?path=` to `JobController` that enqueues an ENRICH job with `payloadRef = path`

## 3. Backend: Cleanup

- [x] 3.1 Remove `POST /api/files/enrich` from `FileController` and its imports
- [x] 3.2 Delete `EnrichResultDto.java`

## 4. Frontend: API Service

- [x] 4.1 Replace `enrichNote()` with `enqueueEnrich(path: string): Observable<EnqueueResponse>` calling `POST /api/jobs/enrich?path=`

## 5. Frontend: Explorer Component

- [x] 5.1 ~~`enriching` signal~~ — removed
- [x] 5.2 Rewrite `enrich()`: show confirmation dialog (warn about auto-save), then save if dirty, then call `api.enqueueEnrich(path)`, then `router.navigate(['/jobs'])`
- [x] 5.3 ENRICH button — removed `[loading]` binding
- [x] 5.4 Remove `enriching` signal declaration — done

## 6. Internationalization

- [x] 6.1 `explorer.enrichButton` / `explorer.toastErrorEnrich` already in `es.json`
- [x] 6.2 Same keys already in `en.json`
- [x] 6.3 Add `explorer.enrichConfirmHeader` and `explorer.enrichConfirmMessage` to both `es.json` and `en.json`
