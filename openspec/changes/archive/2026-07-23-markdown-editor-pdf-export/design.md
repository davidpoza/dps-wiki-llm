## Context

The `ExplorerComponent` (`explorer.component.ts`) hosts a Milkdown markdown editor. The editor renders content as a ProseMirror DOM tree inside `<div #editorContainer class="milkdown-container">`. The current markdown string is kept in the private `currentMarkdown` field, and the rendered DOM is accessible via `this.editorContainer.nativeElement`. The editor header already has a Save `p-button`; the PDF button will sit beside it.

## Goals / Non-Goals

**Goals:**
- Add a "Generate PDF" button in the `editor-header`, always visible when a file is open
- Export the rendered (HTML) view of the markdown, not raw markdown text
- Zero new npm dependencies — use the browser's native print-to-PDF dialog
- Support i18n (Spanish / English button labels)

**Non-Goals:**
- Server-side PDF generation or custom PDF layout engines
- Embedding images from remote URLs (browser print handles what it can render)
- Saving the PDF to the wiki file tree

## Decisions

### Decision 1: Client-side print-window approach over a PDF library

Extract the inner HTML from `.milkdown .editor` inside `editorContainer`, open a hidden `<iframe>` (or `window.open`), write the rendered HTML with an inline print stylesheet, then call `print()` and close.

**Alternatives considered:**
- **jsPDF + html2canvas**: Produces a rasterised PDF (bad for text/copy-paste), adds ~300 KB to the bundle.
- **Server-side (wkhtmltopdf / Puppeteer)**: Requires a new backend endpoint and infrastructure dependency; overkill for a simple export.
- **Browser print window (chosen)**: Zero dependencies, text is selectable in the PDF, respects the OS print dialog (including "Save as PDF"), and the rendering already matches what the user sees.

### Decision 2: `window.open` instead of `<iframe>`

Using `window.open` avoids CSP complexities with `srcdoc` iframes and lets the browser handle the popup lifecycle. The popup is opened, written, printed, then closed automatically after `window.print()` returns.

### Decision 3: Inline print stylesheet in the popup

All styles needed for print are injected as a `<style>` tag inside the popup document. This avoids CORS issues loading external stylesheets and keeps the implementation self-contained. Styles mirror the existing `:host ::ng-deep .milkdown` rules already defined in the component.

### Decision 4: Button always enabled when a file is open

Unlike Save (disabled when not dirty), the PDF button is always enabled whenever `selectedPath()` is truthy — a user may want to export a clean, saved file.

## Risks / Trade-offs

- **Popup blocker** → The `window.open` call is triggered directly from a click event, so browsers should allow it. If blocked, user sees the browser's native popup-blocked indicator. Mitigation: document in the button tooltip.
- **Complex content (tables, code blocks)** → Print CSS may need tuning for edge cases like very wide code blocks. Acceptable for initial version; styles can be refined per user feedback.
- **File title in PDF header** → Using `selectedLabel()` as the document `<title>` so the browser pre-fills the PDF filename. No additional work needed.
