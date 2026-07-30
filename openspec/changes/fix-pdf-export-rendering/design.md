## Context

`FileService.exportPdf()` renders a note to PDF by writing preprocessed markdown to a temp file and running `pandoc <in.md> --pdf-engine=weasyprint --standalone --highlight-style kate --css <style.css> -o <out.pdf>`. The stylesheet is produced inline by `pdfStylesheet()` (a Java text block). Two defects appear in the output:

1. **Code-block artifacts** (`(#cb5-1)`, `(#cb6-2)`, …). With `--highlight-style kate`, pandoc's HTML writer wraps every code line in `<span id="cbN-M">` preceded by an empty, `aria-hidden` anchor `<a href="#cbN-M" tabindex="-1"></a>` (used for line linking). The stylesheet's rule
   ```css
   a::after { content: " (" attr(href) ")"; ... }
   ```
   (`FileService.java:479`) is unscoped, so it fires on those anchors too and prints their `href` (`#cbN-M`) as visible text after every code line.

2. **Level-3/4 headings don't read as headings.** `pdfStylesheet()` does define `h3 { font-size: 1.25em }` and `h4 { font-size: 1.05em }` (`FileService.java:466-467`). On an 11pt base with `line-height: 1.6`, `h4` ≈ 11.55pt bold — barely distinguishable from body text, and `h3`/`h4` sit close together. The reported symptom ("no interpreta headings de nivel 3, 4") is consistent with weak visual weight, but could also be a markdown-parsing gap (e.g. missing space after `#`, or headings swallowed by a preceding construct).

Constraint: pandoc and weasyprint are **not installed in the local dev environment** (only in `backend/Dockerfile`), so end-to-end PDF output cannot be rendered here. Verification is done by (a) unit-asserting the generated CSS/markdown strings and (b) a manual in-container/staging export.

## Goals / Non-Goals

**Goals:**

- Eliminate `(#cbN-M)` artifacts from exported code blocks.
- Keep the URL-after-link affordance for genuine external links.
- Make heading levels 1–6 each visually distinct, with h3/h4 clearly reading as headings.
- Add cheap regression coverage that does not require the pandoc/weasyprint toolchain.

**Non-Goals:**

- Changing the pandoc/weasyprint toolchain, pinning versions, or editing `backend/Dockerfile`.
- Redesigning the overall PDF theme beyond the heading scale needed to fix the defect.
- Changing the frontend "Generate PDF" flow or the existing title-deduplication behavior.

## Decisions

### Decision 1: Scope the link URL-suffix to non-fragment links

Replace the unscoped `a::after` selector with one that excludes intra-document fragment anchors:

```css
a[href]:not([href^="#"])::after { content: " (" attr(href) ")"; ... }
```

Pandoc's code-line anchors all target `#cbN-M`, so `:not([href^="#"])` excludes them while still adding the URL after real external links (`http(s)://…`, `mailto:`, relative paths). This is the minimal, targeted fix and also correctly suppresses noisy suffixes on any legitimate TOC/heading-anchor links.

- **Alternative — hide anchors inside code only** (`pre a::after { content: none }` or `.sourceCode a::after { content: none }`): also works, but is narrower and leaves the suffix firing on other fragment links (e.g. a table-of-contents). Rejected in favour of the more general fragment-based rule; the code-scoped rule may be added as a belt-and-braces second selector if needed.
- **Alternative — disable pandoc line anchors** (e.g. a Lua filter / different highlight config): heavier, touches the pipeline, and pandoc still emits the anchors for highlighted blocks. Rejected.

### Decision 2: Heading cause is parsing (confirmed) — fix the pandoc reader, and also strengthen CSS

Reproduced locally with pandoc 3.1.11 + weasyprint 69.0. **Root cause confirmed as parsing, not styling:** pandoc's default `markdown` reader has `space_in_atx_header` ON, so a heading written without a space after the hashes (`###Heading`) — which Obsidian renders leniently and users commonly author — is emitted as a literal `<p>###Heading</p>`. Properly spaced `### Heading` always parsed. This exactly matches "no interpreta headings de nivel 3, 4" (deeper headings are the ones users tend to write without a space).

- **Primary fix (parsing):** pass `--from=markdown-space_in_atx_header` to pandoc so no-space ATX headings parse. Verified this keeps the base `markdown` reader (so the `{.obsidian-resource-image}` image-attribute syntax from `renderPdfMarkdown()` still works).
- **Complementary fix (CSS):** the original h3/h4 scale was also weak (h4 ≈ body size). Bumped h2→1.6em with a divider rule, h3→1.3em, h4→1.1em with a darker colour, and gave h5/h6 colour/uppercase cues so every level steps down clearly once parsed.

Both fixes are safe and independent; shipping both makes headings robust regardless of authoring style.

### Decision 3: Test at the string level, not the PDF level

Add `FileServiceTests` assertions that:

- `pdfStylesheet()` does **not** contain a bare `a::after` that would match fragment anchors (assert the selector is scoped, e.g. contains `:not([href^="#"])`).
- `pdfStylesheet()` defines distinct, ordered font sizes for h1..h4 (h1 > h2 > h3 > h4 > body).

These run without pandoc/weasyprint and lock in both fixes. End-to-end rendering remains a manual verification step.

## Risks / Trade-offs

- **[Can't render PDF locally → a CSS regression could slip through]** → String-level unit tests catch the specific selectors; a manual in-container export is listed as a task before archiving.
- **[Fragment links legitimately worth showing lose their suffix]** → Acceptable: intra-document fragments (`#…`) are not useful as printed URLs; external links (the ones users care about) keep their suffix.
- **[Heading root cause is parsing, not CSS]** → Mitigated by Decision 2: reproduce before implementing, then branch to the parsing fix instead of the CSS tweak.
- **[weasyprint `:not()`/attribute-selector support]** → weasyprint supports attribute selectors and `:not()`; low risk, confirmed by the manual export.

## Open Questions

- _Resolved:_ the h3/h4 defect is a pandoc parsing gap (`space_in_atx_header` on no-space headings), with weak CSS visual weight as a secondary factor. Both addressed. See Decision 2.
