## MODIFIED Requirements

### Requirement: Health check replaces the Related section on every run for selected notes

On each health check run, the system SHALL fully overwrite the `## Related` section of every **selected** note (notes in the current path filter, or all notes for a full run) with the freshly computed set of semantic links, removing any previously auto-generated links that are no longer in the current result set. Notes that receive a backlink only because they are referenced by a selected note but are not themselves in the selection SHALL NOT have their `Related` section replaced; instead the backlink is appended if absent.

#### Scenario: Second run removes a stale link from a selected note

- **WHEN** a previous health check added `[[wiki/concepts/old-concept.md]]` to a selected note's `Related` section
- **AND** the current run's semantic search does not produce that concept as a candidate above threshold
- **THEN** `[[wiki/concepts/old-concept.md]]` is absent from the note's `Related` section after the run

#### Scenario: Re-running health check on same selection produces identical Related sections for selected notes

- **WHEN** health check is run twice in a row on the same selection without any vault changes between runs
- **THEN** the `Related` sections of all selected notes are byte-for-byte identical after each run

#### Scenario: Out-of-selection note keeps existing Related content after receiving a backlink

- **WHEN** a health check selection contains note A which links semantically to note B
- **AND** B is NOT in the current selection
- **AND** B's `Related` section already contains `[[wiki/concepts/other.md]]`
- **THEN** after the run B's `Related` section contains both `[[wiki/concepts/other.md]]` (preserved) and `[[<A>]]` (appended)

#### Scenario: Backlink is not duplicated on repeated runs

- **WHEN** B's `Related` section already contains `[[<A>]]` from a previous run
- **AND** a new health check selection includes A but not B
- **THEN** B's `Related` section still contains `[[<A>]]` exactly once after the run

#### Scenario: Note with no semantic candidates gets an empty Related section

- **WHEN** health check processes a selected note for which no candidate meets the semantic threshold
- **THEN** the note's `Related` section is cleared (or absent) — no prior links are retained
