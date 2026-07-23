## Why

The Milkdown editor uses the `commonmark` preset, which renders `[text](url)` markdown links visually as `<a>` elements. However, ProseMirror (the underlying engine) intercepts all click events within the editor to manage cursor placement, so clicking a link does not navigate to the URL — the link is visually present but non-functional.

## What Changes

- Add a ProseMirror plugin that intercepts clicks on rendered `<a>` elements (standard markdown links) inside the Milkdown editor and opens the URL in a new browser tab.
- Clicking directly on a link text navigates to the URL (Ctrl/Cmd+Click for OS parity, or a simple click with detection of the anchor element).

## Capabilities

### New Capabilities

- `markdown-link-click`: Click handler for standard markdown links rendered inside the Milkdown editor — detects clicks on `<a>` elements and opens the `href` in a new tab.

### Modified Capabilities

<!-- No existing spec-level requirements change -->

## Impact

- **`frontend/src/app/components/explorer.component.ts`**: Wire up the new link-click plugin alongside the wikilink plugin in `initEditor()`.
- **New file**: `frontend/src/app/components/markdown-link.plugin.ts` — ProseMirror plugin for link click handling (mirrors the structure of `wikilink.plugin.ts`).
- No backend changes. No new npm dependencies (reuses existing `@milkdown/prose` APIs).
