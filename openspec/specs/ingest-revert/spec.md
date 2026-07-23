# ingest-revert Specification

## Purpose
TBD - created by archiving change fix-revert-job-delete-raw-files. Update Purpose after archive.
## Requirements
### Requirement: Raw file is deleted on ingest job revert
When an ingest job is reverted, the raw input file (under `raw/inbox/` or `raw/web/`) that was created when the ingest was submitted SHALL be deleted as part of the revert operation.

#### Scenario: Reverting an ingest job deletes the raw file
- **WHEN** a completed ingest job is reverted
- **THEN** the raw file referenced by the job's `payloadRef` no longer exists on disk

#### Scenario: Revert snapshot records the raw file deletion
- **WHEN** a completed ingest job is reverted
- **THEN** the revert snapshot includes the raw file path with `contentBefore` set to its previous content and `contentAfter` set to null

#### Scenario: Raw path is included in ingest job affected paths
- **WHEN** an ingest job completes successfully
- **THEN** the job's `affectedPaths` includes the raw file path so that conflict detection can prevent revert if a later job also touched that path

#### Scenario: Empty parent directories of the raw file are cleaned up
- **WHEN** the raw file is deleted during revert and its parent directory becomes empty
- **THEN** the empty parent directory is also deleted (consistent with existing `hardReset` cleanup behaviour)

