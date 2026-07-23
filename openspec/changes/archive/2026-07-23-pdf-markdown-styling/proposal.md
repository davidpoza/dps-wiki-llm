## Why

The PDF export feature generates a document via pandoc + weasyprint, but the CSS stylesheet only styles Obsidian-embedded images — all other markdown elements (lists, bold/italic, links, tables, blockquotes, code blocks) render with browser defaults, producing a visually poor and unprofessional document.

## What Changes

- Extend `pdfStylesheet()` in `FileService` to include comprehensive CSS rules for all common markdown-rendered HTML elements: headings, lists, bold, italic, links, tables, images, blockquotes, and code blocks
- Add pandoc `--highlight-style` flag to enable syntax-coloured code blocks via pandoc's built-in highlighting
- Add a page-level CSS reset and typography baseline (font family, line height, margins) for a clean, readable PDF layout

## Capabilities

### New Capabilities

- `pdf-markdown-styling`: Full CSS styling for all markdown-rendered HTML elements in generated PDFs

### Modified Capabilities

<!-- None -->

## Impact

- **Backend only** — one method change in `FileService.java`
- Affected file: `backend/src/main/java/com/dpswikillm/services/FileService.java`
- No new dependencies — pandoc's built-in highlighting and weasyprint's CSS engine already handle everything
