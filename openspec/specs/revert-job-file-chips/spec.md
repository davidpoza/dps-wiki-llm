# revert-job-file-chips Specification

## Purpose
TBD - created by archiving change fix-revert-job-delete-chip. Update Purpose after archive.
## Requirements
### Requirement: Revert job emits DELETE file event for deleted files
During revert execution the system SHALL emit a `file` SSE event with `action = "delete"` for every file that is physically removed from the vault (files whose `contentBefore` was `null` in the original INGEST snapshot).

#### Scenario: File created by INGEST is shown as DELETE during revert
- **WHEN** a REVERT job runs and a file was originally created (not modified) by the target INGEST job
- **THEN** a PROGRESS SSE event with `step = "file"`, `action = "delete"`, and the file's `path` is broadcast before the revert job reaches COMPLETED status

### Requirement: Revert job emits UPDATE file event for restored files
During revert execution the system SHALL emit a `file` SSE event with `action = "update"` for every file that is restored to its prior content (files whose `contentBefore` was non-null in the original INGEST snapshot).

#### Scenario: File modified by INGEST is shown as UPDATE during revert
- **WHEN** a REVERT job runs and a file was modified (not created) by the target INGEST job
- **THEN** a PROGRESS SSE event with `step = "file"`, `action = "update"`, and the file's `path` is broadcast

### Requirement: REST jobs list includes per-file actions for REVERT jobs
The `GET /api/jobs` endpoint SHALL return a `fileEvents` array on each job summary. For REVERT jobs that have a completed snapshot, each entry SHALL have a `path` and an `action` (`"delete"` when `contentAfter` is null, `"update"` otherwise).

#### Scenario: Completed REVERT job summary includes DELETE file events
- **WHEN** `GET /api/jobs` is called and a completed REVERT job has snapshot files where `contentAfter` is null
- **THEN** the response for that job includes `fileEvents` entries with `action = "delete"` for those paths

#### Scenario: INGEST job file events default to modified when no fileEvents present
- **WHEN** `GET /api/jobs` returns a job with an empty or absent `fileEvents` array
- **THEN** the frontend displays those paths with the `"modified"` action chip (existing behavior preserved)

### Requirement: DELETE chip renders with distinct red styling
The job card file list SHALL render a red/danger chip labeled "DELETE" for file entries with `action = "delete"`.

#### Scenario: DELETE chip is visually distinct
- **WHEN** a job's file list contains an entry with `action = "delete"`
- **THEN** the chip background is a red color distinct from the green CREATE and blue UPDATE chips

#### Scenario: Other chip types are unaffected
- **WHEN** a job's file list contains entries with `action = "create"`, `"update"`, `"read"`, or `"modified"`
- **THEN** those chips render with their existing colors unchanged

