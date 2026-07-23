# pdf-markdown-styling Specification

## Purpose
TBD - created by archiving change pdf-markdown-styling. Update Purpose after archive.
## Requirements
### Requirement: PDF renders lists with proper indentation and markers
The generated PDF SHALL display unordered lists with disc bullets and ordered lists with decimal numbering, both with consistent left indentation and spacing between items.

#### Scenario: Unordered list with nested items
- **WHEN** the markdown contains a `- item` unordered list with sub-items
- **THEN** the PDF shows filled disc bullets at the first level and indented markers for nested levels, with no raw `-` characters visible

#### Scenario: Ordered list
- **WHEN** the markdown contains a `1. item` ordered list
- **THEN** the PDF shows `1.`, `2.`, `3.` prefixes with consistent indentation

---

### Requirement: PDF renders bold and italic text
The generated PDF SHALL display `**bold**` as bold (heavier font weight) and `*italic*` as italic (slanted), matching the visual intent of the author.

#### Scenario: Bold text inline
- **WHEN** the markdown contains `**word**`
- **THEN** the PDF renders that word with a visibly heavier font weight compared to surrounding text

#### Scenario: Italic text inline
- **WHEN** the markdown contains `*word*`
- **THEN** the PDF renders that word in an italic (slanted) style

---

### Requirement: PDF renders links with visible URLs
The generated PDF SHALL render hyperlinks as coloured text and SHALL append the target URL in parentheses after the link text, so the URL is usable in a printed document.

#### Scenario: Link with display text
- **WHEN** the markdown contains `[label](https://example.com)`
- **THEN** the PDF shows `label (https://example.com)` with `label` in a distinct link colour

---

### Requirement: PDF renders tables with visible borders
The generated PDF SHALL render GFM tables with a full border around the table, borders between all cells, a shaded header row, and alternating row shading for readability.

#### Scenario: GFM table
- **WHEN** the markdown contains a pipe-delimited table with a header separator row
- **THEN** the PDF shows a table with borders on all cells, the header row visually distinguished, and each row separated by a visible horizontal line

---

### Requirement: PDF renders images within page bounds
The generated PDF SHALL display both Obsidian-style (`![[file.png]]`) and standard markdown (`![alt](path)`) images at their natural size, capped so they never exceed the printable page width or a maximum height of 20 cm.

#### Scenario: Standard markdown image
- **WHEN** the markdown contains `![alt text](path/to/image.png)` and the image file exists
- **THEN** the PDF shows the image centred, fitting within the page width, no taller than 20 cm

---

### Requirement: PDF renders blockquotes with visual indentation
The generated PDF SHALL render blockquotes (`> text`) with a left border bar, left padding, and muted text colour to visually distinguish quoted material from body text.

#### Scenario: Single-level blockquote
- **WHEN** the markdown contains `> quoted text`
- **THEN** the PDF shows the quoted text indented with a visible left border bar and muted colour

---

### Requirement: PDF renders fenced code blocks with syntax highlighting
The generated PDF SHALL render fenced code blocks (`` ``` `` … `` ``` ``) in a monospace font with a light grey background, and SHALL apply syntax-colour highlighting when a language identifier is present (e.g., ` ```java `).

#### Scenario: Code block without language tag
- **WHEN** the markdown contains a fenced code block with no language identifier
- **THEN** the PDF shows the code in a monospace font with a light grey background and no raw backticks

#### Scenario: Code block with language tag
- **WHEN** the markdown contains ` ```java ` followed by Java source code
- **THEN** the PDF shows keywords, strings, and comments in distinct colours within a light grey background block

#### Scenario: Inline code
- **WHEN** the markdown contains `` `inline code` ``
- **THEN** the PDF shows the text in a monospace font with a light grey background, inline with surrounding text

