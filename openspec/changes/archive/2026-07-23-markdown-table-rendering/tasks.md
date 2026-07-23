## 1. Dependency Setup

- [x] 1.1 Add `@milkdown/preset-gfm@7.21.3` to `frontend/package.json` and run `pnpm install` in the `frontend/` directory
- [x] 1.2 Verify the package resolves without peer-dependency conflicts against `@milkdown/core@7.21.3`

## 2. Enable GFM Preset in Editor

- [x] 2.1 Import `gfm` from `@milkdown/preset-gfm` in `frontend/src/app/components/explorer.component.ts`
- [x] 2.2 Add `.use(gfm)` to the Milkdown editor builder chain (after `.use(commonmark)`)
- [x] 2.3 Verify that a document with a GFM table renders as an HTML table in the editor (manual smoke test)

## 3. Table Serializer

- [x] 3.1 Implement `serializeTableToMarkdown(node: PMNode): string` in `live-preview.plugin.ts` — iterates over `table_row` children and their `table_cell`/`table_header` children to produce the GFM pipe syntax
- [x] 3.2 Ensure the serializer emits a separator row (`| --- |` per column) as the second line, derived from the header row column count

## 4. Table Parser

- [x] 4.1 Implement `parseMarkdownToTable(raw: string, schema: Schema): PMNode | null` in `live-preview.plugin.ts` — parses GFM table text (validates presence of separator row, extracts header and data rows, builds `table` / `table_row` / `table_header` / `table_cell` ProseMirror nodes)

## 5. Live Preview — Cursor Detection

- [x] 5.1 Implement `findTableAtCursor(state: EditorState): { from: number; to: number; node: PMNode } | null` — walks up the node tree from the cursor to find the nearest `table` ancestor node

## 6. Live Preview — Expand / Collapse Logic

- [x] 6.1 Add `'table'` to the LP state `mode` union type in `live-preview.plugin.ts`
- [x] 6.2 In the `appendTransaction` block (not-expanded path): call `findTableAtCursor`; if a table is found, replace it with a `code_block` node containing the serialized raw text, set `mode: 'table'` in the LP meta, and place the cursor at the start of the `code_block`
- [x] 6.3 In the `appendTransaction` block (currently-expanded path, `mode === 'table'`): detect cursor exit from the `code_block`; extract raw text; attempt `parseMarkdownToTable`; if valid, replace the `code_block` with the table node; if invalid, emit a `collapse` without replacing (leave as `code_block`)

## 7. CSS Styling

- [x] 7.1 Add CSS rules for `.milkdown .editor table` in `explorer.component.ts` styles section: border-collapse, cell borders, header background, padding, and responsive overflow
- [x] 7.2 Verify table styles look correct in both light and dark themes

## 8. Verification

- [x] 8.1 Open a document with a GFM table (`| A | B |\n|---|---|\n| 1 | 2 |`) and confirm it renders as an HTML table when cursor is elsewhere
- [x] 8.2 Move cursor into the table and confirm it expands to raw Markdown text in a code block
- [x] 8.3 Edit a cell value in the raw view, move cursor out, and confirm the table re-renders with the updated value
- [x] 8.4 Edit raw text to produce invalid table syntax, move cursor out, and confirm the block remains as a code block (not broken)
- [x] 8.5 Confirm undo/redo works correctly across expand/collapse cycles
