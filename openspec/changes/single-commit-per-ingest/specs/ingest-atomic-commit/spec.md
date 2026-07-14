## ADDED Requirements

### Requirement: Unattended ingestion produces exactly one git commit
The pipeline SHALL create one and only one git commit per unattended ingestion job, containing all file mutations produced across every pipeline step (source note, index, connection link patches, idempotency ledger, change log).

#### Scenario: Baseline and connections committed together
- **WHEN** an unattended ingestion job completes successfully
- **THEN** exactly one new git commit exists containing the source note, INDEX.md, all patched connection files, the idempotency ledger, and the change log

#### Scenario: Job commit range is a single range
- **WHEN** an unattended ingestion job completes
- **THEN** `Job.commitRange` contains a single `<before>..<after>` SHA range (no commas)

### Requirement: Validated ingestion retains two-phase commit
The pipeline SHALL still commit the baseline immediately when the job enters AWAITING_REVIEW, and commit the accepted connections separately when the user submits the guided review.

#### Scenario: Baseline commits on transition to AWAITING_REVIEW
- **WHEN** a validated ingestion job transitions to AWAITING_REVIEW
- **THEN** a git commit containing the source note and INDEX.md is created before the job pauses

#### Scenario: Connections commit on guided review submission
- **WHEN** a user submits a guided review with accepted candidates
- **THEN** a separate git commit is created containing the patched connection files
