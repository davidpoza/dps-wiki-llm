## Context

The frontmatter metadata panel lives entirely in `frontend/src/app/components/explorer.component.ts`. In read mode each entry is rendered as:

```html
<span class="fm-value">{{ formatFmValue(entry[1]) }}</span>
```

`formatFmValue(value)` (≈ line 2319) collapses any value to a single string: arrays are `join(', ')`, `Date` → ISO date, everything else `String(value)`. The result is inert text.

The app already has the two navigation behaviors we need:

- **Internal wiki navigation** — `navigateToWikilink(target: string)` (≈ line 2363) resolves a `[[target]]` to a file by `data`/`label` (with/without `.md`), guards unsaved changes via `confirmationService`, and shows a broken-link toast when nothing resolves. The editor's `wikilink.plugin.ts` uses `WIKILINK_RE = /\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g` and calls the same `onNavigate` → `navigateToWikilink`.
- **Wikilink styling** — `.wikilink-token` already defines the clickable link look used inside the editor.

There is no existing helper for opening an external URL in a new tab; the markdown-link plugin only manages link marks inside the ProseMirror editor.

This is a small, frontend-only, additive UI change. A design doc is warranted mainly to lock down how a value is tokenized and how the template renders mixed text/link segments safely in Angular.

## Goals / Non-Goals

**Goals:**
- Render `http(s)` URLs inside frontmatter values as links that open in a new tab.
- Render `[[wikilink]]` / `[[wikilink|alias]]` inside frontmatter values as links that navigate in-app via the existing `navigateToWikilink`.
- Support array values so each element is tokenized independently.
- Leave non-link text untouched and leave YAML edit mode as plain text.
- Reuse existing navigation and styling; no new dependencies.

**Non-Goals:**
- No clickable links in the editable YAML `<textarea>`.
- No resolution of bare relative paths/filenames that are not written as `[[...]]`.
- No backend, API, or data-model changes.
- No change to how frontmatter is parsed or persisted.

## Decisions

### 1. Tokenize values into a typed segment model, render with `@for` + `@switch`

Add a pure helper, `formatFmValueSegments(value: unknown): FmSegment[]`, that returns an ordered list of segments:

```ts
type FmSegment =
  | { kind: 'text'; text: string }
  | { kind: 'external'; text: string; href: string }
  | { kind: 'internal'; text: string; target: string };
```

The template replaces the single interpolation with a loop that renders `<a>` for `external`/`internal` segments and a plain `<span>`/text node for `text`. Rationale: keeping tokenization in TypeScript (returning a typed model) avoids building HTML strings and `innerHTML`, so there is **no sanitization/XSS surface** — Angular escapes all text bindings, and hrefs for internal links are never assigned to `href` (they call a handler). We considered `[innerHTML]` with a sanitizer pipe but rejected it as riskier and harder to wire to the in-app navigation handler.

### 2. Array handling: flatten to segments with separators

`formatFmValueSegments` handles arrays by tokenizing each element and inserting a literal `", "` text segment between elements — preserving today's visual output (`join(', ')`) while making each element's links independent. Scalars (string, number, Date) are stringified first (reusing the existing `formatFmValue` conventions for `Date`) and then tokenized.

### 3. Matching: reuse the editor's wikilink regex, add a URL regex

Tokenization scans each string for both patterns and splits on the earliest match:
- Wikilink: the same shape as `WIKILINK_RE` (`\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]`). `match[1]` is the navigation target; `match[2]` (alias) or `match[1]` is the display text.
- External URL: `/https?:\/\/[^\s]+/` with trailing punctuation (`.,;:!?)`]}`) trimmed off the matched URL so a trailing period in prose is not swallowed into the link.

A single left-to-right scan picks whichever pattern matches at the lowest index, emits the preceding text as a `text` segment, emits the link segment, and continues after it. This keeps mixed text/link values correct and order-preserving.

### 4. Internal vs external click handling

- `external` → a real `<a [href]="seg.href" target="_blank" rel="noopener noreferrer">`. No JS handler needed; the browser opens a new tab and `noopener` prevents `window.opener` access.
- `internal` → an `<a>` with no `href` (or `href="#"` + `preventDefault`), whose `(click)` calls the existing `navigateToWikilink(seg.target)`. This reuses the dirty-check confirmation and broken-link toast for free, matching editor behavior exactly.

### 5. Styling

Add a `.fm-link` class scoped to `.fm-value` mirroring `.wikilink-token` (link color, pointer cursor, hover underline). Internal and external links share the affordance; no need to visually distinguish them for this iteration.

## Risks / Trade-offs

- **URL boundary detection is heuristic** → Mitigation: trim a small set of trailing punctuation; accept that unusual URLs with spaces/parentheses may under/over-match. This only affects presentation, never data.
- **A value could contain regex-special text that looks like a partial `[[`** → Mitigation: the scan only emits an `internal` segment on a full `WIKILINK_RE` match; unmatched `[[` stays as `text`.
- **Broken internal links look identical to valid ones until clicked** → Mitigation: intentional — the existing broken-link toast already communicates this on click, consistent with editor wikilinks. Pre-validating every value against the file tree is out of scope.
- **Rendering many links per panel** → negligible; frontmatter has few keys and the tokenizer is O(n) over each value string.

## Migration Plan

Pure frontend change; ships with the normal frontend build. No migrations, feature flags, or rollback steps beyond reverting the commit. Values with no links render byte-for-byte as before, so there is no behavioral risk to existing notes.

## Open Questions

- Should non-wikilink internal references (bare paths like `notes/foo.md`) also be linkified? Deferred to a future iteration; only `[[...]]` syntax is in scope here.
