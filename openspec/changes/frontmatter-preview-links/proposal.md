## Why

The frontmatter metadata panel renders every value as inert plain text (`formatFmValue` → a single string in `<span class="fm-value">`). When a value is a URL or a reference to another wiki note, the user has to read it, copy it, and manually open it. The rest of the app already treats links as first-class — wikilinks in the editor navigate on click, external links open in a new tab — but the metadata panel is a dead end. Making the values clickable closes that gap so metadata like `source: https://...` or `related: [[Some Note]]` becomes navigable.

## What Changes

- Parse each frontmatter value shown in the read-only preview and render recognized links as clickable elements instead of plain text.
- Recognize **external links**: bare `http://` / `https://` URLs embedded in a value. Clicking opens the URL in a new browser tab (`target="_blank"` with `rel="noopener noreferrer"`).
- Recognize **internal wiki links**: `[[Note]]` / `[[Note|alias]]` wikilink syntax embedded in a value. Clicking navigates to that note inside the wiki, reusing the existing `navigateToWikilink` flow (name/path resolution, unsaved-changes confirmation, and the broken-link toast when the target does not exist).
- Handle array values (currently joined with `", "`): each element is parsed independently so a list like `related: [[A]], [[B]]` yields two separate links.
- Non-link text within a value continues to render as plain text; only the matched link spans become interactive.
- Out of scope: making links clickable in the raw YAML **edit** mode (the editable `<textarea>` stays plain text); resolving relative file paths that are not written as `[[wikilink]]` syntax.

## Capabilities

### New Capabilities
<!-- None. This extends the existing frontmatter panel rather than introducing a new capability. -->

### Modified Capabilities
- `frontmatter-panel`: the read-only metadata panel gains clickable external and internal links; the "read-only / text-only" requirement is refined so that following a link is navigation, not editing.

## Impact

- **Frontend (Angular)** — `frontend/src/app/components/explorer.component.ts`:
  - Template (`~line 355`): replace the plain `{{ formatFmValue(entry[1]) }}` span with a rendering that emits link elements for matched segments.
  - New helper that tokenizes a frontmatter value into text / external-link / internal-link segments (built on the existing `WIKILINK_RE` pattern and an http(s) URL pattern).
  - New external-link open handler (new tab, `noopener`); internal links reuse the existing `navigateToWikilink` method.
  - New CSS for the link affordance in `.fm-value` (cursor, color/hover), aligned with the existing `.wikilink-token` styling.
- No backend, API, or data-model changes.
- No breaking changes: values without links render exactly as before.
