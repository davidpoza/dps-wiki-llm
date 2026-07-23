## 1. Implement title de-duplication

- [x] 1.1 Add a `stripDuplicateFrontmatterTitle(String markdown)` helper in `FileService` that detects a leading `---`…`---` frontmatter block and reads the top-level `title:` value (unquoting and trimming).
- [x] 1.2 In the helper, scan the body for a heading `^#{1,6}\s+(.+?)\s*$` whose trimmed text equals the title; when matched, remove the top-level `title:` line from the frontmatter and return the rewritten markdown, otherwise return the markdown unchanged.
- [x] 1.3 Invoke the helper in `exportPdf` on the raw markdown before it is written to the temp input (alongside the existing `renderPdfMarkdown` call).

## 2. Tests

- [x] 2.1 Add a unit test: frontmatter title matching a body H1 → helper strips the frontmatter `title:` line (title rendered once).
- [x] 2.2 Add a unit test: frontmatter title with no matching body heading → markdown returned unchanged (title block preserved).
- [x] 2.3 Add unit tests for edge cases: no frontmatter, no `title` field, and quoted/whitespace-padded title matching a heading of a different level.

## 3. Verify

- [x] 3.1 Export a PDF for an intake note that has both a frontmatter `title` and a matching `# {title}` H1; confirm the title appears exactly once. _(pandoc/weasyprint not installed locally; verified the markdown fed to pandoc against the real note "Mucosal serotonin reuptake transporter (SERT)…": title occurrences dropped from 2 → 1, heading preserved.)_
- [x] 3.2 Export a PDF for a note whose title exists only in the frontmatter; confirm the title still renders. _(Verified against the real note "Qué es el AI harness…": markdown returned unchanged, frontmatter title preserved so pandoc still renders it.)_
