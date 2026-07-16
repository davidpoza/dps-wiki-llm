## ADDED Requirements

### Requirement: GFM table rendering
The editor SHALL render GFM-syntax tables as native HTML table elements when the cursor is not inside the table node.

#### Scenario: Table in document renders as HTML table
- **WHEN** a document contains valid GFM table syntax (`| col | col |\n|---|---|\n| a | b |`)
- **THEN** the editor SHALL display a formatted `<table>` with header and body rows, not raw text

#### Scenario: Invalid table syntax renders as plain text
- **WHEN** a line starts with `|` but does not form a valid GFM table (missing separator row)
- **THEN** the editor SHALL render it as plain paragraph text

### Requirement: Table live preview — expand on cursor enter
The editor SHALL expand a rendered table to its raw GFM Markdown text when the cursor moves into the table node, using a `code_block` node to preserve multi-line content.

#### Scenario: Cursor enters table — expand to raw Markdown
- **WHEN** the cursor moves into any part of a rendered table (any cell or row)
- **THEN** the table node SHALL be replaced with a `code_block` containing the full GFM Markdown representation of that table
- **AND** the cursor SHALL be placed at the start of the `code_block`
- **AND** the operation SHALL NOT be added to undo history

#### Scenario: Expanded table shows correct raw syntax
- **WHEN** a table with N columns and M rows is expanded
- **THEN** the raw text SHALL contain N+1 lines: one header row, one separator row (`| --- |` per column), and M-1 data rows

### Requirement: Table live preview — collapse on cursor exit
The editor SHALL collapse the `code_block` back to a rendered table when the cursor moves out of the expanded block, if the content is valid GFM table syntax.

#### Scenario: Cursor exits expanded table block — valid syntax
- **WHEN** the cursor was inside an LP-expanded `code_block` (mode='table') and moves outside
- **THEN** the `code_block` SHALL be replaced with the parsed `table` node
- **AND** the table SHALL reflect any edits made to the raw text during expansion

#### Scenario: Cursor exits expanded table block — invalid syntax
- **WHEN** the cursor exits an LP-expanded `code_block` whose content is no longer valid GFM table syntax
- **THEN** the `code_block` SHALL remain as a regular `code_block` (not converted to table)

#### Scenario: Cursor exits expanded table block — unchanged content
- **WHEN** the cursor exits an LP-expanded `code_block` with content identical to `originalRaw`
- **THEN** the operation SHALL NOT be added to undo history

### Requirement: Table CSS styling
The editor SHALL apply consistent visual styles to rendered table nodes matching the application's light and dark themes.

#### Scenario: Table renders with visible borders and headers
- **WHEN** a table is rendered in the editor
- **THEN** it SHALL display with visible cell borders, a distinct header row background, and readable cell padding

#### Scenario: Table styles adapt to dark theme
- **WHEN** the application is in dark mode
- **THEN** table borders and header background SHALL use colors appropriate to the dark palette (no white on white / black on black)
