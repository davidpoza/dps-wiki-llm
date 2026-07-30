## Why

The PDF export produced by `FileService.exportPdf` (pandoc + weasyprint) renders two markdown constructs incorrectly: fenced code blocks are polluted with visible anchor artifacts like `(#cb5-1)`, `(#cb6-2)` on every line, and level-3/level-4 headings do not read as headings. Both make exported PDFs look broken and hard to read, undermining a core feature of the wiki.

## What Changes

- Fix the PDF stylesheet so the `a::after { content: "(" attr(href) ")" }` URL-suffix rule no longer applies to pandoc's per-line code anchors (`<a href="#cbN-M">`), eliminating the `(#cb5-1)` style artifacts inside code blocks while still showing real URLs after genuine external links.
- Ensure level-3 and level-4 headings render as clearly distinguishable headings in the PDF (reproduce first to confirm whether the cause is CSS visual weight or a markdown parsing gap, then apply the appropriate fix).
- Add regression coverage over the generated markdown/CSS so these artifacts and heading regressions are caught without needing the full pandoc/weasyprint toolchain.

## Capabilities

### New Capabilities

_None._

### Modified Capabilities

- `markdown-pdf-export`: Add a requirement that PDF export renders markdown content faithfully — fenced code blocks contain no anchor/URL artifacts, and heading levels 1–6 are each visually distinguishable as headings.

## Impact

- **Code**: `backend/src/main/java/com/dpswikillm/services/FileService.java` — `pdfStylesheet()` (link `::after` rule and heading styles); possibly `renderPdfMarkdown()` / pandoc invocation in `exportPdf()` if the heading issue is a parsing gap.
- **Tests**: `backend/src/test/java/com/dpswikillm/services/FileServiceTests.java` — assertions on the generated CSS/markdown.
- **Dependencies**: None. No changes to the pandoc/weasyprint toolchain or `backend/Dockerfile`.
- **Spec**: `openspec/specs/markdown-pdf-export/spec.md` (delta).
