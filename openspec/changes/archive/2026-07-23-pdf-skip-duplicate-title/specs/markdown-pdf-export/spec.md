## ADDED Requirements

### Requirement: PDF export avoids duplicating the note title
The system SHALL include the frontmatter-derived title block in the exported PDF only when the note body does not already contain that title as a heading. When the note body already contains the title as a heading, the system SHALL suppress the separate title block so the title is not rendered twice.

#### Scenario: Title present in both frontmatter and body
- **WHEN** a note has a `title` field in its YAML frontmatter and its body begins with a heading whose text matches that title (e.g. an injected `# {title}` H1)
- **THEN** the exported PDF SHALL render the title exactly once, using the body heading, and SHALL NOT render an additional frontmatter-derived title block

#### Scenario: Title only in frontmatter
- **WHEN** a note has a `title` field in its YAML frontmatter but its body contains no heading matching that title
- **THEN** the exported PDF SHALL render the frontmatter-derived title block so the document still shows a title

#### Scenario: No frontmatter title
- **WHEN** a note has no `title` field in its YAML frontmatter
- **THEN** the exported PDF SHALL render the body as-is without introducing any title block

#### Scenario: Title match ignores heading level and surrounding whitespace
- **WHEN** the body heading text matches the frontmatter title after trimming whitespace, regardless of the heading level used
- **THEN** the frontmatter-derived title block SHALL be suppressed to avoid duplication
