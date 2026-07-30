## ADDED Requirements

### Requirement: Content index updated on note save

The system SHALL update the document content index for a note whenever the note is saved, upserting the note's current title, doc type, and body so the new content is searchable without a full reindex.

#### Scenario: Saved note body is indexed

- **WHEN** a note is saved via `PUT /files/content`
- **THEN** the `documents` index entry for that path SHALL be upserted with the note's current title, doc type, and body derived from the saved content

#### Scenario: Newly written text is immediately searchable

- **WHEN** a user edits a note to include a phrase that was not present before and saves it
- **THEN** a content search for that phrase SHALL return the note without any full reindex being run

#### Scenario: Save failure does not corrupt the index

- **WHEN** saving a note fails before the file is written
- **THEN** the content index entry for that path SHALL remain unchanged

### Requirement: Content index kept consistent on note create, delete, rename, and move

The system SHALL keep the document content index consistent with the vault when notes are created, deleted, renamed, or moved, so content search never returns paths that no longer exist and always reflects current locations.

#### Scenario: Created note is indexed

- **WHEN** a new note file is created
- **THEN** an index entry SHALL be upserted for its path

#### Scenario: Deleted note is removed from the index

- **WHEN** a note is deleted
- **THEN** its index entry SHALL be removed and it SHALL no longer appear in content search results

#### Scenario: Renamed note updates its path in the index

- **WHEN** a note is renamed
- **THEN** the index entry for the old path SHALL be removed and an entry for the new path SHALL be upserted with the note's content

#### Scenario: Moved note updates its path in the index

- **WHEN** a note is moved to a different folder
- **THEN** the index entry for the old path SHALL be removed and an entry for the new path SHALL be upserted with the note's content

### Requirement: Content index updated on ingest

The system SHALL ensure that notes created or updated by an ingest job have their content reflected in the document content index by the time the job completes, so ingested content is searchable.

#### Scenario: Ingested note content is searchable after ingest

- **WHEN** an ingest job completes and produces or updates a wiki note
- **THEN** a content search for text contained in that note SHALL return it

### Requirement: Full reindex rebuilds the content index from the vault

The system SHALL rebuild the document content index to match the current vault contents when a full reindex is triggered from Settings, so the index reflects every current note and drops entries for notes that no longer exist.

#### Scenario: Reindex reconciles the index with the vault

- **WHEN** a full reindex is triggered from the Settings screen
- **THEN** the content index SHALL contain one entry per current wiki note with its current content
- **AND** entries for notes that no longer exist in the vault SHALL be removed
