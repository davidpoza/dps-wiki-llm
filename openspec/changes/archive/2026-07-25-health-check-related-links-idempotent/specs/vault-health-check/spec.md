## MODIFIED Requirements

### Requirement: New connections are discovered and materialized bidirectionally

During phase 2 the system SHALL iterate over every note under `wiki/concepts` and `wiki/sources`, find semantically similar notes using embeddings (general neighbor search plus a dedicated `topic` search), compute the full desired set of Related links for each note, and **replace** (not append to) each note's `Related` section with that computed set. The inverse backlink is likewise replaced in the target note's `Related` section.

#### Scenario: New semantic connection found

- **WHEN** phase 2 evaluates a source note and finds a target note whose similarity score meets the connection threshold and is not the source itself
- **THEN** the system includes `[[<target>]]` in the source note's new `Related` section content
- **AND** includes `[[<source>]]` in the target note's new `Related` section content
- **AND** counts the connection towards the "connections found" total

#### Scenario: Connection to a curated topic

- **WHEN** phase 2 evaluates a source note and the dedicated `topic` search returns a `wiki/topics` note above the topic threshold
- **THEN** the system links the source note to that topic note bidirectionally, in addition to any general semantic connections

#### Scenario: No candidates above threshold

- **WHEN** phase 2 evaluates a source note and no candidate meets the threshold
- **THEN** the source note's `Related` section is cleared on write (no prior links retained)

### Requirement: Only new links are added without duplication

The system SHALL NOT produce duplicate links within the computed `Related` section of a single health check run. A link discovered via multiple search paths (general semantic + topic) SHALL appear at most once in the resulting section.

#### Scenario: Same target discovered via two search paths

- **WHEN** a target note appears in both the general semantic results and the topic search results for the same source note
- **THEN** the source note's `Related` section contains the link to that target exactly once

#### Scenario: Same pair discovered from both directions

- **WHEN** the same source/target pair is discovered while processing each of the two notes
- **THEN** the resulting `Related` sections contain the link exactly once in each note
