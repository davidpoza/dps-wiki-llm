## MODIFIED Requirements

### Requirement: Title deduplication before PDF export
The system SHALL suppress the frontmatter `title` field when rendering a note to PDF if the note body contains at least one level-1 heading (`# …`), regardless of whether the H1 text matches the frontmatter title. If no level-1 heading exists in the body, the frontmatter `title` SHALL be preserved so pandoc renders it as the document title block.

#### Scenario: Note body has H1 with same text as frontmatter title
- **WHEN** a note has `title: My Note` in frontmatter AND `# My Note` in the body
- **THEN** the PDF SHALL NOT include a separate title block from frontmatter (only the body H1 is rendered)

#### Scenario: Note body has H1 with different text from frontmatter title
- **WHEN** a note has `title: My Note` in frontmatter AND `# A Different Heading` in the body
- **THEN** the PDF SHALL NOT include the frontmatter title block (the H1 in the body is sufficient)

#### Scenario: Note body has no H1
- **WHEN** a note has `title: My Note` in frontmatter AND no `#` level-1 heading in the body
- **THEN** the PDF SHALL render the frontmatter title as the document title block

#### Scenario: Note body has only H2 or deeper headings
- **WHEN** a note has `title: My Note` in frontmatter AND only `## Section` or deeper headings in the body
- **THEN** the PDF SHALL render the frontmatter title as the document title block

#### Scenario: Note has no frontmatter
- **WHEN** a note has no YAML frontmatter block
- **THEN** the markdown is passed to pandoc unchanged
