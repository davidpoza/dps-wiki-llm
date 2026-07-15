## ADDED Requirements

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
