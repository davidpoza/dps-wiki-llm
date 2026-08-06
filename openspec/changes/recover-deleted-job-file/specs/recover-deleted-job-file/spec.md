## ADDED Requirements

### Requirement: Recover a single deleted file from a job snapshot

The system SHALL expose an endpoint `POST /api/jobs/{id}/files/recover` accepting the target file `path`. When called, the system SHALL locate, within the snapshot linked to job `{id}`, the snapshot-file entry for the normalized `path` that represents a deletion (its `contentAfter` is `null` and its `contentBefore` is non-null), recreate that file in the vault with its `contentBefore` content (creating any missing parent directories), and return success. The recovery SHALL affect only the requested file and SHALL NOT modify, revert, or re-run any other part of the job.

#### Scenario: Deleted file is recreated with its pre-deletion content

- **WHEN** a client calls `POST /api/jobs/{id}/files/recover` with the path of a file that job `{id}` deleted (snapshot entry has `contentAfter = null`, `contentBefore` non-null) and that path does not currently exist in the vault
- **THEN** the system writes `contentBefore` to that path, returns a success response, and leaves every other file touched by the job unchanged

#### Scenario: Recovered file is indexed, versioned, and replicated

- **WHEN** a deleted file is successfully recovered
- **THEN** the system records the recreation in a snapshot (so the recovery is itself visible in file history and reversible via file versions), reindexes the recreated file, and replicates the recreation to WebDAV

#### Scenario: Path is not a recoverable deletion

- **WHEN** a client requests recovery for a path that job `{id}` did not delete (no snapshot-file entry, or the entry has non-null `contentAfter`, or the job has no snapshot)
- **THEN** the system rejects the request with an error and does not modify the vault

#### Scenario: Target path already exists

- **WHEN** a client requests recovery for a deleted path that currently exists in the vault (for example it was recreated by a later change)
- **THEN** the system rejects the request with a conflict error and does not overwrite the existing file

### Requirement: RECOVER action on deleted-file entries in the jobs viewer

The jobs viewer SHALL render a RECOVER button next to every job file entry whose action is `delete`. The button SHALL NOT appear for entries with any other action (`create`, `update`, `read`, `modified`). Activating the button SHALL request recovery of only that entry's file for that job.

#### Scenario: RECOVER button shown next to a DELETE chip

- **WHEN** a job card lists a file entry with `action = "delete"`
- **THEN** a RECOVER button is rendered next to that entry's DELETE chip and path

#### Scenario: No RECOVER button for non-deleted entries

- **WHEN** a job card lists a file entry with an action other than `delete`
- **THEN** no RECOVER button is rendered for that entry

#### Scenario: Activating RECOVER recovers only that file

- **WHEN** the user clicks the RECOVER button for a deleted file entry
- **THEN** the client calls the recovery endpoint with that job's id and that file's path, and no other entry in the job is affected

### Requirement: Recovered-state feedback in the jobs viewer

After a file entry is successfully recovered, the jobs viewer SHALL reflect that outcome for that entry so the user is not offered the same recovery again in the current view.

#### Scenario: Entry reflects success after recovery

- **WHEN** the recovery request for a deleted file entry completes successfully
- **THEN** that entry no longer offers an active RECOVER button and instead indicates a recovered state

#### Scenario: Failure leaves the action available

- **WHEN** the recovery request for a deleted file entry fails (for example the path already exists)
- **THEN** the entry does not show a recovered state and the failure is surfaced to the user
