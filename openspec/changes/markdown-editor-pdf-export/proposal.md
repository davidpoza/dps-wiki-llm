## Why

Users need to share and print wiki articles, but there's no way to export the rendered content from the editor. Adding a PDF export button next to "Save" provides a one-click path to generate a clean, printable document from any open markdown file.

## What Changes

- Add a **"Generate PDF"** (`p-button`) next to the existing Save button in the `editor-header` of `ExplorerComponent`
- Implement a `generatePdf()` method that opens a print-preview window with the rendered markdown HTML and proper print styles
- Add i18n keys (`explorer.generatePdf`) for the button label in `en.json` and `es.json`

## Capabilities

### New Capabilities

- `markdown-pdf-export`: Export the currently open markdown file as a PDF using the browser's native print-to-PDF dialog; renders the Milkdown editor HTML with clean print-optimised styles

### Modified Capabilities

- `markdown-editor-toolbar`: The editor header gains a second action button (PDF) alongside the existing Save button

## Impact

- **Frontend only** — no backend changes required
- Affected files: `explorer.component.ts`, `en.json`, `es.json`
- No new npm dependencies (uses `window.print()` with an inline print stylesheet)
