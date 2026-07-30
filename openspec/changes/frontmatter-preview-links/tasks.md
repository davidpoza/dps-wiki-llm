## 1. Value tokenization helper

- [x] 1.1 In `explorer.component.ts`, define the `FmSegment` type (`text` | `external` | `internal`) as described in design.
- [x] 1.2 Add a `formatFmValueSegments(value: unknown): FmSegment[]` method that reuses the existing `formatFmValue` scalar/`Date` conventions and tokenizes each string.
- [x] 1.3 Implement single-pass scanning that matches the wikilink pattern (same shape as `WIKILINK_RE`) and an `https?://` URL pattern, choosing the earliest match and emitting preceding text as a `text` segment.
- [x] 1.4 For external URLs, trim trailing punctuation (`.,;:!?)]}`) from the matched href.
- [x] 1.5 For wikilinks, use `match[2]` (alias) or `match[1]` as display text and `match[1]` as navigation target.
- [x] 1.6 Handle array values by tokenizing each element and inserting a `", "` text segment between elements.

## 2. Template rendering

- [x] 2.1 Replace the plain `{{ formatFmValue(entry[1]) }}` interpolation in the `.fm-value` span with a `@for` loop over `formatFmValueSegments(entry[1])`.
- [x] 2.2 Render `external` segments as `<a [href]="seg.href" target="_blank" rel="noopener noreferrer">{{ seg.text }}</a>`.
- [x] 2.3 Render `internal` segments as an `<a>` (no real navigation href) with `(click)="navigateToWikilink(seg.target)"` and `preventDefault`.
- [x] 2.4 Render `text` segments as escaped text (interpolation), preserving spacing/separators.
- [x] 2.5 Confirm the editable YAML `<textarea>` path is untouched (links only affect read mode).

## 3. Styling

- [x] 3.1 Add a `.fm-link` class scoped under `.fm-value` mirroring `.wikilink-token` (link color, pointer cursor, hover underline) in the component styles.

## 4. Verification

- [x] 4.1 Open a note whose frontmatter has an external URL value; confirm it renders as a link and opens in a new tab.
- [x] 4.2 Open a note with a `[[wikilink]]` value that resolves; confirm clicking navigates to that note.
- [x] 4.3 Confirm a `[[Nonexistent]]` value shows the broken-link toast and does not change files.
- [x] 4.4 Confirm an array value with multiple wikilinks renders each element as a separate link, and a mixed text+link value keeps non-link text plain.
- [x] 4.5 Run the frontend lint/build (`pnpm lint` / `pnpm build`) and fix any issues.
