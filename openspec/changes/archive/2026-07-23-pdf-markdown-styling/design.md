## Context

The PDF export pipeline in `FileService.exportPdf()` reads a markdown file, preprocesses it with `renderPdfMarkdown()` (which converts Obsidian image embeds to standard markdown), then pipes the result through pandoc with `--pdf-engine=weasyprint`. A CSS file is passed via `--css`. Currently `pdfStylesheet()` only contains styles for `.obsidian-resource-image` and `figure` — all other elements rely on browser/weasyprint defaults: no table borders, no code block background, no blockquote indentation, lists rendered but unstyled, etc.

## Goals / Non-Goals

**Goals:**
- Add comprehensive CSS to `pdfStylesheet()` covering: page layout, body typography, headings, bold/italic, links (with visible href), ordered/unordered lists, blockquotes, inline code, fenced code blocks (pre + code), tables, and standard images
- Enable pandoc's built-in syntax highlighting for code blocks (`--highlight-style kate`) so keywords are coloured in the PDF
- Keep the pipeline unchanged — no new tools, libraries, or backend endpoints

**Non-Goals:**
- Custom fonts or font embedding (system fonts are fine)
- Dark-mode PDF variant
- Per-file CSS overrides
- Frontend changes

## Decisions

### Decision 1: CSS-only approach (no new library or tool)

Weasyprint is already the PDF engine; it supports the full CSS 2.1 spec plus significant CSS 3 (flexbox, grid, custom properties partially). All required styling — borders, padding, font-family, page margins — can be expressed in plain CSS that weasyprint handles reliably.

**Alternatives considered:**
- **Pandoc HTML template + external fonts**: More control, but requires maintaining an HTML template file and web fonts.
- **wkhtmltopdf instead of weasyprint**: Better JS support, but already committed to weasyprint; switching breaks existing deployments.

### Decision 2: Add `--highlight-style kate` to the pandoc invocation

Pandoc ships syntax highlighting for 140+ languages via its internal KDE Kate highlight engine. Adding `--highlight-style kate` outputs `<span class="...">` tokens that are styled by pandoc's own embedded CSS (injected with `--standalone`). The `kate` style is light-background-friendly and readable when printed.

**Alternatives considered:**
- **Custom highlight stylesheet**: Full control, but duplicates what pandoc already ships.
- **No highlighting**: Code blocks appear as monochrome monospace — acceptable but visually plain.

### Decision 3: Inline the CSS as a Java text block

The stylesheet stays in `pdfStylesheet()` as a multiline text block rather than a file on disk. This keeps the code self-contained, avoids classpath resource loading, and is consistent with the existing pattern.

### Decision 4: Show link URLs in parentheses after link text

In print, hyperlinks are not clickable. Including the URL inline (`a::after { content: " (" attr(href) ")"; }`) makes links useful in printed PDFs. Long URLs are handled with `word-break: break-all`.

## Risks / Trade-offs

- **Very wide code blocks** → Use `overflow-x: auto` in screen, `white-space: pre-wrap; word-break: break-all` for print to avoid text clipping. Acceptable trade-off.
- **Pandoc `--highlight-style` adds `<style>` block with `--standalone`** → Since we already pass `--standalone`, pandoc injects its own highlight CSS inside `<head>`. Our external CSS file is applied after, so our `pre code` rules win specificity contests where needed.
- **Image sizing from standard markdown** → Regular `![alt](url)` images are sized by their natural dimensions. We cap them at `max-width: 100%; max-height: 20cm` to keep them on the page.
