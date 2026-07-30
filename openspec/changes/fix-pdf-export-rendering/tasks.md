## 1. Reproduce and diagnose

- [x] 1.1 Create a representative test note containing headings `#`…`######` (with proper spacing), an external link, an intra-document fragment link, and a fenced code block with a language tag (e.g. ```` ```java ````). _(Also added a no-space-heading variant `###Heading`.)_
- [x] 1.2 Export the note to PDF and confirm both defects. _(pandoc 3.1.11 + weasyprint 69.0 installed locally in a scratchpad venv; before-fix render showed `(#cb1-1)`…`(#cb1-5)` on every code line and `###`/`####` headings rendered as literal `<p>` text.)_
- [x] 1.3 Determine the h3/h4 root cause. _(Confirmed **parsing**, not CSS: pandoc's default `space_in_atx_header` extension treats `###Heading` (no space, as commonly authored in Obsidian) as plain text. CSS visual weight was also weak, so both fixes applied — Decision 2.)_

## 2. Fix code-block anchor artifacts

- [x] 2.1 In `FileService.pdfStylesheet()`, scope the link URL-suffix rule to `a[href]:not([href^="#"])::after`.
- [x] 2.2 Re-export and confirm. _(Code block clean — 0 `(#cbN-M)`; external link keeps `(https://example.com)`; fragment link has no URL suffix. Verified via extracted PDF text and rasterized PNG.)_

## 3. Fix heading rendering

- [x] 3.1 Strengthen heading CSS distinctness: `h2` 1.6em + divider rule, `h3` 1.3em, `h4` 1.1em + `#3d444d`, `h5`/`h6` colour, `h6` uppercase.
- [x] 3.2 Parsing fix: added `--from=markdown-space_in_atx_header` to the pandoc invocation in `exportPdf()` so `###`/`#### ` headings without a space parse as headings (matches Obsidian). Verified the Obsidian image-attribute syntax `{.obsidian-resource-image}` still survives the flag.
- [x] 3.3 Re-export and confirm all heading levels render distinctly, including no-space `###`/`####`. _(Verified via rasterized PNG.)_

## 4. Regression tests

- [x] 4.1 `FileServiceTests.pdfStylesheetScopesUrlSuffixAwayFromFragmentAnchors` — asserts the `::after` selector is scoped and no bare `a::after` remains.
- [x] 4.2 `FileServiceTests.pdfStylesheetGivesEachHeadingLevelADistinctSize` — asserts strictly decreasing h1>h2>h3>h4 font sizes with h4 > 1em (body). Made `pdfStylesheet()` package-private for the assertions.
- [x] 4.3 `mvn -Dtest=FileServiceTests test` → 12 tests, 0 failures, BUILD SUCCESS.

## 5. Verify and document

- [x] 5.1 Final PDF export verified end-to-end (pandoc + weasyprint) on representative notes covering all reported constructs; both defects gone. _(Live vault note not pulled — vault is remote WebDAV; representative notes cover the same markdown constructs.)_
- [x] 5.2 No changes needed to `backend/Dockerfile` or the pandoc/weasyprint dependencies (Non-Goal upheld) — fix is code + CSS only.
