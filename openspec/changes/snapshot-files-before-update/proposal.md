## Why

Multiple job types emit repeated SSE events with the same `step` name inside loops: keyword regeneration emits `step="progress"` once per file (up to 512+), concept merge emits `step="merge"` once per group, and others may follow the same pattern. The jobs store appends every event that carries a `message` to the `phases` array unconditionally, so the jobs panel floods with hundreds of stacked rows instead of a single updating line per step.

The snapshot-before-update mechanism is already correct in the backend (handlers call `snapshotService.captureFile()` before each write). The bug is entirely in how the frontend accumulates phase events.

## What Changes

- `jobs.store.ts`: when an incoming event has the same `step` as an existing phase entry, replace it in place instead of appending — so each distinct step name appears at most once in the phases list, always showing its latest value.
- `jobs.store.ts`: additionally route `step="progress"` events whose message is a parseable JSON object (`{processed, total, updated, failed}`) to `currentActivity` instead of `phases`, matching the pattern already used for health-check and `-scan` events.
- `types.ts` / `ScanActivity`: extend with optional `updated` and `failed` integer fields.
- `jobs-viewer.component.ts` template: show `updated` / `failed` counts in the `scan-activity` area when present.

## Capabilities

### New Capabilities

- `job-progress-in-place`: For any job, repeated SSE events with the same step SHALL update the existing phase display entry rather than appending a new row.

### Modified Capabilities

- `job-queue-and-progress`: The phase accumulation rule changes from always-append to find-and-replace by step; the `currentActivity` type gains optional `updated`/`failed` fields.

## Impact

- **Frontend only**: `jobs.store.ts`, `types.ts`, `jobs-viewer.component.ts`.
- No backend changes required — payload format and snapshot mechanism are already correct.
