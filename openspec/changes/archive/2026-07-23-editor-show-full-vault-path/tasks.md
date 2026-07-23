## 1. Render the full path in the header

- [x] 1.1 In the editor (`explorer.component.ts`), replace the `.editor-title` markup that shows `selectedLabel()` (filename only) with markup that renders the full vault-relative path from `selectedPath()`: a muted directory portion span and an emphasized filename span (filename = last segment; directory = everything before it, with trailing `/`).
- [x] 1.2 Handle the root-level case: when the path has no directory portion, render only the filename span with no leading separator.
- [x] 1.3 Apply the same treatment to the read-only viewer (`document-viewer.component.ts`) for consistency (`filePath()` split into muted dir + emphasized filename).

## 2. Styling and layout

- [x] 2.1 Add/adjust styles so the directory portion is de-emphasized (muted color, matching `--app-text-muted`) and the filename keeps the current emphasis (bold, larger).
- [x] 2.2 Ensure long paths wrap or truncate gracefully (`overflow-wrap`/`word-break` or ellipsis) so the header does not break the layout, including on narrow/mobile viewports.

## 3. Verify

- [x] 3.1 Open a document in a nested folder and confirm the header shows the full path with the filename emphasized.
- [x] 3.2 Open a root-level document and confirm the header shows just the filename with no leading separator.
- [x] 3.3 Open a document with a long path on a narrow viewport and confirm the layout stays intact.
