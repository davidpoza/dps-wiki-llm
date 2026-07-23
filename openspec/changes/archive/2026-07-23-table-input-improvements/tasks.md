## 1. Paste Handler

- [x] 1.1 Add a ProseMirror `handlePaste` plugin to `live-preview.plugin.ts` that intercepts paste events, checks if clipboard text is valid GFM table syntax using `parseMarkdownToTable`, and replaces the inserted text with the table node
- [x] 1.2 Verify pasting a GFM table from clipboard into the editor renders it as an HTML table

## 2. Input Rule

- [x] 2.1 Add `handleKeyDown` to `live-preview.plugin.ts` props: when Enter is pressed in a paragraph matching a separator row (`| --- | --- |`), look at the preceding paragraph; if it matches a header row pattern, replace both with a table node
- [x] 2.2 Verify typing `| A | B |` + Enter + `| --- | --- |` + Enter in the editor converts to a table node

## 3. Insert Table Button

- [x] 3.1 Add an "+ Table" button to the editor header in `explorer.component.ts` that calls `insertTableAtCursor` (exported from `live-preview.plugin.ts`) to insert a blank 2×2 ProseMirror table node
- [x] 3.2 Verify the button inserts a table (LP expands it for editing, collapses to rendered table on exit)
