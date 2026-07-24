# keyword-regeneration-job Specification

## Purpose
TBD - created by archiving change regenerate-keywords. Update Purpose after archive.
## Requirements
### Requirement: Enqueue keyword regeneration as a durable job

The system SHALL expose `POST /api/keywords/regenerate` that accepts a JSON body `{"paths": ["<vault-relative-path>", ...]}` and creates a `REGENERATE_KEYWORDS` job persisted in the `jobs` table, enqueued on the write RabbitMQ queue, returning `202 Accepted` with the job id and queue position.

#### Scenario: Successful enqueue

- **WHEN** an authenticated client POSTs `{"paths": ["wiki/concepts/foo.md"]}` to `/api/keywords/regenerate`
- **THEN** the system creates a job with type `REGENERATE_KEYWORDS` and status `QUEUED`, saves the path list as JSON under `raw/keywords/<jobId>.json`, enqueues the job, and returns `202 Accepted` with `{"jobId": "<uuid>", "queuePosition": <n>}`

#### Scenario: Empty paths list is rejected

- **WHEN** an authenticated client POSTs `{"paths": []}` to `/api/keywords/regenerate`
- **THEN** the system returns `400 Bad Request`

#### Scenario: Unauthenticated request is rejected

- **WHEN** an unauthenticated client POSTs to `/api/keywords/regenerate`
- **THEN** the system returns `401 Unauthorized`

### Requirement: Job processes notes with forced overwrite

The system SHALL process each path listed in the job payload by regenerating keywords regardless of whether the note already has a non-empty `keywords` frontmatter field, overwriting any existing value.

#### Scenario: Note already has keywords

- **WHEN** the job processes a note whose frontmatter already contains a non-empty `keywords` field
- **THEN** the system generates new keywords via the LLM and overwrites the existing `keywords` field in the note's frontmatter

#### Scenario: Note outside target folders is skipped safely

- **WHEN** a path included in the job payload resolves to a file outside `wiki/concepts` and `wiki/sources`
- **THEN** the system skips that path and records it as an error in the job result without aborting the rest

### Requirement: Real-time SSE progress per note

The system SHALL emit `PROGRESS` SSE events on the `/api/jobs/events` stream for each note processed, including counts of processed, updated, skipped, and failed notes.

#### Scenario: Progress event per note

- **WHEN** the job finishes processing a note (success or failure)
- **THEN** the system broadcasts a `PROGRESS` event containing `{"processed": n, "total": t, "updated": u, "failed": f}` to all SSE subscribers

#### Scenario: Completion event

- **WHEN** the job finishes processing all notes
- **THEN** the system broadcasts a `COMPLETED` event with the final counts and marks the job `COMPLETED`

### Requirement: Atomic git commit and revert support

The system SHALL commit all keyword changes produced by a single job in one git commit after all notes are processed, record the pre-job git SHA and commit range in the job record, and support revert via `JobRevertService` by reverting that commit range.

#### Scenario: Single commit per job

- **WHEN** the job completes processing N notes
- **THEN** all modified notes are committed in a single git commit, and the job record stores `preGitSha` and `commitRange`

#### Scenario: Revert removes keyword changes

- **WHEN** a completed `REGENERATE_KEYWORDS` job is reverted
- **THEN** the system creates a git revert of the job's commit range, restoring the previous keyword values (or absence of keywords), and marks the job `REVERTED`

#### Scenario: Job with no updates still completes cleanly

- **WHEN** the job processes notes but none require changes (e.g., LLM returns identical keywords)
- **THEN** the job completes with status `COMPLETED` without creating an empty git commit

### Requirement: Note listing endpoint

The system SHALL expose `GET /api/notes/list?folders=<comma-separated-folders>` returning a JSON array of `{"path": "<vault-relative-path>", "title": "<inferred-title>", "hasKeywords": <boolean>}` for each `.md` file found in the specified folders, reading the filesystem directly.

#### Scenario: List notes in target folders

- **WHEN** an authenticated client requests `GET /api/notes/list?folders=wiki/concepts,wiki/sources`
- **THEN** the system returns a `200 OK` with an array of note objects for every `.md` file under those folders

#### Scenario: hasKeywords reflects frontmatter state

- **WHEN** a note has a non-empty `keywords` field in its frontmatter
- **THEN** the corresponding entry in the response has `"hasKeywords": true`

