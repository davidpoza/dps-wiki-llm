## MODIFIED Requirements

### Requirement: New connections are discovered and materialized bidirectionally

During phase 2 the system SHALL iterate over every note in the effective selection (all `wiki/` notes for a full run; the `pathFilter` set for a partial run), find semantically similar notes using embeddings (general neighbour search plus a dedicated `topic` search), compute the full desired set of Related links for each selected note, and **replace** (not append to) each selected note's `Related` section with that computed set. The inverse backlink SHALL be written to the target note's `Related` section using **append-mode** when the target is NOT itself in the current selection, or **replace-mode** when it IS in the current selection.

#### Scenario: New semantic connection found — source is in selection

- **WHEN** phase 2 evaluates a source note that is in the current path selection and finds a target note whose similarity score meets the connection threshold
- **THEN** the system includes `[[<target>]]` in the source note's new `Related` section content (replacing the section entirely)
- **AND** counts the connection towards the "connections found" total

#### Scenario: Backlink written to a note outside the current selection

- **WHEN** a connection A→B is discovered and B is NOT in the current path selection
- **THEN** the system appends `[[<A>]]` to B's `Related` section only if that link is not already present
- **AND** the rest of B's `Related` section content is preserved unchanged

#### Scenario: Backlink written to a note inside the current selection

- **WHEN** a connection A→B is discovered and B IS in the current path selection
- **THEN** B's `Related` section is fully replaced when B is processed as a source (not when the backlink is written from A)

#### Scenario: Full-vault run treats every note as primary

- **WHEN** the health check is launched without a path filter (full run)
- **THEN** every note under `wiki/` is considered in the selection and all `Related` sections are fully replaced

#### Scenario: No candidates above threshold

- **WHEN** phase 2 evaluates a source note and no candidate meets the threshold
- **THEN** the source note is left unchanged (only notes with computed links are rewritten)
