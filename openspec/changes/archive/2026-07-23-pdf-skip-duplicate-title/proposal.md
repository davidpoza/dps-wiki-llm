## Why

Notes created by the intake pipeline carry the article title both in the YAML frontmatter (`title:`) and as an injected `# {title}` H1 at the top of the body. When such a note is exported to PDF, pandoc's `--standalone` mode renders the frontmatter `title` as a title block *and* the body H1 renders on its own, so the title appears twice in the generated document.

## What Changes

- The PDF export SHALL render the frontmatter-derived title block only when the note body does not already contain the same title as a heading, so the title is never duplicated.
- When the body already contains the title (e.g. the injected `# {title}` H1), the frontmatter `title` metadata is suppressed before pandoc runs so no separate title block is produced.
- When the body does not contain the title, the current behaviour is preserved (the title block is still rendered).

## Capabilities

### New Capabilities
<!-- None -->

### Modified Capabilities
- `markdown-pdf-export`: The title is included in the exported PDF only if it is not already present as a heading in the note content, preventing duplication.

## Impact

- **Backend only** — logic change in `FileService.exportPdf` / `renderPdfMarkdown`.
- Affected file: `backend/src/main/java/com/dpswikillm/services/FileService.java`.
- No API, dependency, or frontend changes; the `/api/files/pdf` contract is unchanged.
