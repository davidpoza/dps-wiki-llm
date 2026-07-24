# rename-note-job Specification

## Purpose
TBD - created by archiving change rename-note-from-editor. Update Purpose after archive.
## Requirements
### Requirement: RENAME job type exists in the system
The backend SHALL define `RENAME` as a valid `JobType` value so the job queue can accept and dispatch rename operations.

#### Scenario: RENAME is a known JobType
- **WHEN** a RENAME job is enqueued
- **THEN** `JobConsumers` recognises `JobType.RENAME` and routes it to `RenameJobService`

---

### Requirement: Enqueue rename via REST
The backend SHALL expose `POST /api/jobs/rename?path=<relative-path>&newName=<new-filename>` that validates the input, creates a persisted job record, and enqueues it on the write queue, responding `202 Accepted` with `EnqueueJobResponse` (job id + queue position).

#### Scenario: Successful enqueue
- **WHEN** a client POSTs to `/api/jobs/rename?path=notes/foo.md&newName=bar.md` and the path exists and `bar.md` does not
- **THEN** the backend responds `202 Accepted` with a job id and queue position

#### Scenario: Conflict detected at enqueue time
- **WHEN** a client POSTs to `/api/jobs/rename` and a file with `newName` already exists in the same directory
- **THEN** the backend responds `409 Conflict` without creating a job

#### Scenario: Invalid path rejected at enqueue time
- **WHEN** a client POSTs to `/api/jobs/rename` with a `path` that does not exist in the vault
- **THEN** the backend responds `404 Not Found` without creating a job

---

### Requirement: RENAME job renames the file
When a RENAME job is consumed, the system SHALL move the vault file from its old path to the sibling path with `newName`, preserving file contents. The job payload SHALL encode `{"path":"<old-rel>","newName":"<new-filename>"}`.

#### Scenario: File is moved on disk
- **WHEN** the RENAME job is consumed
- **THEN** the file at the old relative path no longer exists and the file at the new relative path contains the same content

#### Scenario: Job is marked COMPLETED after rename
- **WHEN** the file move succeeds and all link rewrites complete
- **THEN** the job record transitions to `COMPLETED`

#### Scenario: Job is marked FAILED if file move fails
- **WHEN** the file move throws an IOException (e.g. target directory gone)
- **THEN** the job record transitions to `FAILED` with the error message and no link rewrites are attempted

---

### Requirement: RENAME job rewrites inbound Markdown links
After moving the file, the job SHALL scan every `.md` file under the vault root and rewrite any reference to the old path so it points to the new path. Two link formats SHALL be handled:

1. **Markdown links**: `[text](old-rel-path)` → `[text](new-rel-path)`
2. **Wikilinks**: `[[OldStem]]` and `[[OldStem|alias]]` → `[[NewStem]]` / `[[NewStem|alias]]` where the stem is the filename without the `.md` extension

#### Scenario: Markdown link in another note is rewritten
- **WHEN** a note `B.md` contains `[see also](notes/foo.md)` and `foo.md` is renamed to `bar.md`
- **THEN** after the job completes, `B.md` contains `[see also](notes/bar.md)`

#### Scenario: Wikilink in another note is rewritten
- **WHEN** a note `B.md` contains `[[foo]]` and `foo.md` is renamed to `bar.md`
- **THEN** after the job completes, `B.md` contains `[[bar]]`

#### Scenario: Wikilink with alias is rewritten preserving alias
- **WHEN** a note `B.md` contains `[[foo|display text]]` and `foo.md` is renamed to `bar.md`
- **THEN** after the job completes, `B.md` contains `[[bar|display text]]`

#### Scenario: Notes with no reference to the renamed file are untouched
- **WHEN** a note `C.md` contains no link to the old path or old stem
- **THEN** `C.md` is not modified by the RENAME job

#### Scenario: Link rewrite failure is logged but does not abort the job
- **WHEN** one `.md` file cannot be written during link rewriting (e.g. permission error)
- **THEN** the error is logged, remaining files are still processed, and the job still completes

