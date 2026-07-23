## Why

When a user types GFM table syntax (`| Col1 | Col2 |` etc.) directly in the Milkdown editor, the content is stored as paragraph text. The Milkdown serializer escapes the leading pipe (`\| Col1 |`), so the table syntax never round-trips to a real table node. Users cannot create tables by typing markdown — they have to create files externally with table content pre-written.

## What Changes

Three complementary mechanisms allow users to create tables from within the editor:

1. **Paste detection** — pasting GFM table markdown converts it to a ProseMirror table node immediately.
2. **Input rule** — typing a complete separator row (`| --- | --- |`) followed by Enter detects the header row above and converts both into a table node.
3. **Insert Table button** — a toolbar button in the editor inserts a blank 2×2 table node.

## Capabilities

### New Capabilities
- `table-paste`: Paste handler that converts pasted GFM table markdown to a ProseMirror table node
- `table-input-rule`: Input rule that detects typed separator row and converts preceding header text to a table
- `table-insert-button`: Toolbar button in the editor UI that inserts a blank 2×2 table

### Modified Capabilities
<!-- none -->
