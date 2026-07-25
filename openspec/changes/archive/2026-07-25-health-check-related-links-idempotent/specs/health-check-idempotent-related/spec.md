## ADDED Requirements

### Requirement: Health check replaces the Related section on every run

On each health check run, the system SHALL fully overwrite the `## Related` section of every processed note with the freshly computed set of semantic links, removing any previously auto-generated links that are no longer in the current result set.

#### Scenario: Second run removes a stale link

- **WHEN** a previous health check added `[[wiki/concepts/old-concept.md]]` to a note's `Related` section
- **AND** the current run's semantic search does not produce that concept as a candidate above threshold
- **THEN** `[[wiki/concepts/old-concept.md]]` is absent from the note's `Related` section after the run

#### Scenario: Re-running health check produces identical Related sections

- **WHEN** health check is run twice in a row without any vault changes between runs
- **THEN** the `Related` sections of all processed notes are byte-for-byte identical after each run

#### Scenario: Note with no semantic candidates gets an empty Related section

- **WHEN** health check processes a note for which no candidate meets the semantic threshold
- **THEN** the note's `Related` section is cleared (or absent) — no prior links are retained

### Requirement: Manual Links section is never modified by health check

The system SHALL NOT read from, write to, or remove the `## Manual Links` section of any note during health check execution. This section is reserved for user-curated links that must survive health-check rewrites.

#### Scenario: Manual Links preserved after health check run

- **WHEN** a note contains a `## Manual Links` section with one or more entries
- **AND** health check runs and rewrites the note's `Related` section
- **THEN** the `## Manual Links` section is unchanged in content and position

#### Scenario: Health check does not duplicate Manual Links into Related

- **WHEN** a note's `## Manual Links` section contains `[[wiki/concepts/foo.md]]`
- **AND** health check discovers `wiki/concepts/foo.md` as a semantic candidate
- **THEN** `[[wiki/concepts/foo.md]]` appears in the `Related` section (computed) and the `Manual Links` section (preserved) independently — the health check does not skip adding it to `Related` on account of it already existing in `Manual Links`

### Requirement: Manual Links section has a stable document position

When the `MarkdownService` renders a note, the `## Manual Links` section SHALL appear after `## Related` and before `## Sources` in the default section ordering.

#### Scenario: Rendering order is consistent

- **WHEN** a note contains `Related`, `Manual Links`, and `Sources` sections in any order in the file
- **THEN** after a health-check rewrite the rendered note has the sections in the order: `Related` → `Manual Links` → `Sources`

### Requirement: MutationAction supports section replacement mode

The `MutationAction` domain object SHALL carry an optional `sectionReplacements` map. When a section name appears in this map, `MutationApplier` SHALL overwrite that section's entire content with the provided list, ignoring any pre-existing content in that section. Sections not listed in `sectionReplacements` are unaffected.

#### Scenario: Replace overwrites existing content

- **WHEN** a MutationAction has `sectionReplacements = {"Related": ["- [[a.md]]"]}`
- **AND** the note's current `Related` section contains `["- [[b.md]]", "- [[c.md]]"]`
- **THEN** after applying the action, `Related` contains only `- [[a.md]]`

#### Scenario: Replace with empty list clears the section

- **WHEN** a MutationAction has `sectionReplacements = {"Related": []}`
- **THEN** after applying the action, the note has no `Related` section content
