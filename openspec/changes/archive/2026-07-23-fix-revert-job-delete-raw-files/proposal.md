## Why

When an ingest job is reverted, the snapshot mechanism correctly restores wiki notes and `INDEX.md` to their pre-ingestion state, but the raw input file written by `RawIntakeService` to `raw/inbox/` or `raw/web/` is not tracked in the snapshot and is therefore left orphaned on disk. Reverting an ingest should undo it completely, including removing the raw file that was created as part of that ingestion request.

## What Changes

- **`SnapshotService`**: Add `captureFileAsNew(Snapshot, String)` — captures a path with `contentBefore = null`, marking it as "created by this job" so that `hardReset` deletes it on revert.
- **`IngestPipelineService.run()`**: Call `captureFileAsNew(snapshot, payload.rawPath())` at the start of the pipeline and `recordAfter(snapshot, payload.rawPath())` at the end (both in unattended and `validated` code paths). Add the raw path to `affectedPaths`.
- **Tests**: Update `IngestPipelineServicesTests` and `JobRevertServiceTests` to cover the new behavior.

## Capabilities

### New Capabilities
_(none)_

### Modified Capabilities
- `ingest-revert`: Reverting an ingest job now also deletes the associated raw file from `raw/inbox/` or `raw/web/`.

## Impact

- `SnapshotService` — new method, no breaking changes to existing callers.
- `IngestPipelineService` — two additional snapshot calls per pipeline run.
- Jobs ingested before this fix will not have the raw path in their snapshot; reverting them will continue to leave the raw file in place (acceptable, no regression).
- No API or database schema changes required.
