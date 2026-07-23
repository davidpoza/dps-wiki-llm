## Context

`FileService.exportPdf` writes the note's raw markdown (including its YAML frontmatter) to a temp file and runs `pandoc ... --standalone --pdf-engine=weasyprint`. In `--standalone` mode, pandoc's default template renders the top-level `title` metadata field as a `<h1 class="title">` block at the top of the document.

Notes produced by `RawIntakeService` contain the article title in two places:
- the frontmatter top-level `title:` field, and
- an injected `# {title}` H1 as the first line of the body (`RawIntakeService.java:45,83`).

As a result the exported PDF shows the title twice: once from pandoc's title block and once from the body H1. Notes that only have a frontmatter title (no matching body heading) correctly show the title once and must keep doing so.

## Goals / Non-Goals

**Goals:**
- Render the title exactly once in the exported PDF.
- Suppress the frontmatter-derived title block only when the body already contains the title as a heading.
- Preserve today's behaviour for notes whose title lives only in the frontmatter.

**Non-Goals:**
- Changing how notes are authored or how `RawIntakeService` injects the H1.
- Changing the `/api/files/pdf` API contract, the stylesheet, or any frontend code.
- Deduplicating titles anywhere other than PDF export.

## Decisions

**Decision: Suppress the frontmatter `title` rather than strip the body heading.**
The user requirement is that the title stays in the note content and the *added* title block is dropped. Removing the top-level `title:` line from the frontmatter before handing the file to pandoc makes pandoc's `--standalone` template omit the title block, while the body heading renders normally. Rationale: this keeps the visible title identical to what the author sees in the editor and touches only the throwaway temp copy, never the stored note.

*Alternative considered:* strip the body H1 instead — rejected because it contradicts the requirement ("include the title only if it is not already in the content") and would drop an anchor the author intentionally placed.

*Alternative considered:* stop using `--standalone` or supply a custom template that never emits a title — rejected because notes with a frontmatter-only title would then lose their title entirely.

**Decision: Detect the duplicate by comparing the frontmatter title to body headings.**
Add a helper (e.g. `stripDuplicateFrontmatterTitle(String markdown)`) invoked in `exportPdf` before writing the temp input. It:
1. Detects a leading YAML frontmatter block (`---` … `---`).
2. Reads the top-level `title:` value, unquoting a surrounding `"…"`/`'…'` and trimming.
3. Scans the body for a heading line matching `^#{1,6}\s+(.+?)\s*$` whose captured text, trimmed, equals the title.
4. If a match exists, removes the top-level `title:` line from the frontmatter (leaving all other fields intact) and returns the rewritten markdown; otherwise returns the markdown unchanged.

Only the top-level `title:` is considered, matching what pandoc consumes; nested keys such as `kindle-sync.title` are ignored. Comparison is case-sensitive after trimming, which is sufficient because the body H1 is generated from the same title string.

**Decision: Order relative to `renderPdfMarkdown`.**
Title stripping and the existing image-embed rewrite are independent. Apply the title strip to the raw markdown, then pass the result through `renderPdfMarkdown` (or vice-versa) — the two operate on disjoint regions (frontmatter vs. image links), so ordering does not affect correctness.

## Risks / Trade-offs

- **Title string mismatch (quoting/whitespace/special chars) leaves a false duplicate** → normalise both sides by unquoting and trimming before comparing; the body heading is derived from the same title, so exact-after-trim matching is reliable for intake-generated notes.
- **Frontmatter parsing edge cases (no frontmatter, multiline/block-scalar title, `title` appearing mid-document)** → only treat a fence at the very start of the file as frontmatter and only match a simple single-line `title:` scalar; anything else is left untouched (fails safe to current behaviour, i.e. no worse than today).
- **Removing the wrong line** → match the `title:` key anchored at column 0 within the frontmatter block only, never inside the body.
