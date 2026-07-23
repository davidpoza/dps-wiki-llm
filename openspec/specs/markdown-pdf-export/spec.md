# markdown-pdf-export Specification

## Purpose
TBD - created by archiving change pdf-skip-duplicate-title. Update Purpose after archive.
## Requirements
### Requirement: PDF export avoids duplicating the note title
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

### Requirement: PDF export from markdown editor
The system SHALL provide a "Generate PDF" button in the editor header that exports the currently rendered markdown content as a PDF via the browser's native print dialog.

#### Scenario: Button visible when file is open
- **WHEN** a file is selected and open in the editor
- **THEN** the "Generate PDF" button SHALL be visible in the editor header

#### Scenario: Button triggers print dialog
- **WHEN** the user clicks the "Generate PDF" button
- **THEN** the browser's print dialog SHALL open with the rendered markdown content

#### Scenario: PDF content matches rendered view
- **WHEN** the print dialog opens
- **THEN** the content SHALL reflect the current rendered HTML of the markdown (headings, lists, code blocks, links) rather than raw markdown text

#### Scenario: PDF filename defaults to article title
- **WHEN** the print dialog opens
- **THEN** the document title SHALL be set to the currently open file name so the browser pre-fills the PDF save dialog with a meaningful filename

#### Scenario: Button enabled for saved and unsaved files
- **WHEN** a file is open regardless of its dirty/saved state
- **THEN** the "Generate PDF" button SHALL be enabled and clickable

#### Scenario: i18n label
- **WHEN** the UI language is Spanish
- **THEN** the button label SHALL display the Spanish translation key `explorer.generatePdf`
- **WHEN** the UI language is English
- **THEN** the button label SHALL display the English translation for `explorer.generatePdf`

