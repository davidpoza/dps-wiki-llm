## Why

During ingestion, the `concept-resolution` phase proposes and deduplicates key concepts, but this work happens silently — no SSE events are emitted and no trace is stored, so the user cannot see which concepts were proposed, whether they were new or merged into existing ones. Additionally, note paths shown in the jobs and changes screens are plain text, forcing users to manually navigate to notes instead of clicking directly.

## What Changes

- **Concept proposals**: `ConceptResolutionService` emits a `concept-proposal` SSE event for each concept it processes, indicating the proposed path/title and whether it was resolved to an existing note (deduped) or kept as new.
- **Persistent concept proposal trace**: Concept proposals are stored in a new `concept_proposals` JSON column on the `jobs` table and returned in job API responses, so proposals remain visible after the job completes.
- **Clickable note paths in jobs screen**: File paths in `job.files` and the `currentActivity.path` in `JobsViewerComponent` become clickable links that open the note in the markdown editor.
- **Clickable note paths in changes screen**: File path text in `GitHistoryComponent` becomes a clickable link (in addition to the existing icon button), using the same `router.navigate(['explorer', ...])` pattern.

## Capabilities

### New Capabilities

- `job-concept-proposals`: SSE-based concept proposal events emitted during `concept-resolution` phase, persisted in the `jobs` table, included in job API responses, and displayed in the jobs screen both live (during execution) and as a persistent trace after completion.

### Modified Capabilities

- `clickable-note-paths`: File paths in the jobs screen (`JobsViewerComponent`) and changes screen (`GitHistoryComponent`) are rendered as clickable links that navigate to the markdown editor.

## Impact

- **Backend**: `Job` entity + migration (new `concept_proposals` jsonb column), `ConceptResolutionService` (emit events + return proposals), `JobLifecycleService` (new method to store and broadcast concept proposals), `JobSummary`/job detail DTO (include proposals in API response).
- **Frontend**: `JobState` type (add `conceptProposals` array), `JobsStore` (handle `concept-proposal` SSE step and merge from API), `JobsViewerComponent` (display concept proposals section, clickable file paths), `GitHistoryComponent` (clickable path text).
- **DB**: Flyway migration to add `concept_proposals jsonb` column to `jobs` table.
