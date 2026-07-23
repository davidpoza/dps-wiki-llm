## ADDED Requirements

### Requirement: Revertible job records

The system SHALL record, for each state-mutating job, the pre-job git HEAD, the commit range the job produced, and references to the database rows it created or updated (documents, embeddings, operations), so the job can be reverted later.

#### Scenario: Job captures revert metadata

- **WHEN** a state-mutating job commits its changes
- **THEN** the job record stores the pre-job git SHA, the produced commit range, and references to the affected database rows

### Requirement: Revert git and database together

The system SHALL revert a job by creating a git revert of the job's commit range in the vault and applying compensating database changes (removing created rows, restoring updated rows), keeping git and database consistent, then reindexing.

#### Scenario: Successful revert

- **WHEN** a reviewer reverts a completed job that has no later conflicting changes
- **THEN** the system git-reverts the job's commits, rolls back the corresponding documents/embeddings rows, reindexes, marks the job `REVERTED`, and reports success

#### Scenario: Revert is itself auditable

- **WHEN** a job is reverted
- **THEN** the revert is recorded as its own operation with a change-log entry and commit, not a silent history rewrite

### Requirement: Conflict detection on revert

The system SHALL detect when a later job modified files or rows touched by the job being reverted and SHALL refuse to silently overwrite, reporting the conflict for the reviewer to resolve.

#### Scenario: Later change blocks silent revert

- **WHEN** the job being reverted touched a file that a subsequent job also modified
- **THEN** the system reports a conflict and does not overwrite the later change
