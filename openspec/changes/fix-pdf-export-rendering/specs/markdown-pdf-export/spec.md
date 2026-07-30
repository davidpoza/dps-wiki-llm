## ADDED Requirements

### Requirement: PDF export renders code blocks without anchor artifacts

The system SHALL export fenced code blocks to PDF without any visible anchor or URL artifacts (such as `(#cb5-1)`, `(#cb6-2)`) introduced by pandoc's per-line source anchors. The URL-suffix styling that appends `(href)` after links SHALL apply only to genuine external hyperlinks, not to intra-document fragment anchors (`href` values beginning with `#`).

#### Scenario: Fenced code block with syntax highlighting

- **WHEN** a note containing a fenced code block with a language tag (e.g. ```` ```java ````) is exported to PDF
- **THEN** the rendered code block SHALL show only the code lines
- **AND** no `(#cbN-M)` style text SHALL appear on any code line

#### Scenario: Real external link keeps its URL suffix

- **WHEN** a note contains an external link such as `[Docs](https://example.com)` and is exported to PDF
- **THEN** the link text SHALL be followed by its URL in parentheses `(https://example.com)`

#### Scenario: Intra-document fragment link has no URL suffix

- **WHEN** a note contains a link whose target is a fragment anchor (`href` beginning with `#`)
- **THEN** the link SHALL NOT be followed by a parenthesised URL suffix

### Requirement: PDF export renders all heading levels distinctly

The system SHALL render markdown heading levels 1 through 6 in the exported PDF such that each level is visually distinguishable as a heading, with level-3 and level-4 headings clearly heavier and/or larger than surrounding body text rather than reading as ordinary paragraphs.

#### Scenario: Level-3 heading is rendered as a heading

- **WHEN** a note contains a `### Section` heading and is exported to PDF
- **THEN** the heading text SHALL be rendered as a heading that is visually distinct from body paragraph text

#### Scenario: Level-4 heading is rendered as a heading

- **WHEN** a note contains a `#### Subsection` heading and is exported to PDF
- **THEN** the heading text SHALL be rendered as a heading that is visually distinct from body paragraph text and from adjacent heading levels
