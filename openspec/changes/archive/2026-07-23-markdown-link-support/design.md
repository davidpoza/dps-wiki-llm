## Context

The Milkdown editor wraps ProseMirror, which owns all DOM events inside the editor container. The `commonmark` preset already parses `[text](url)` syntax and renders `<a href="url">text</a>` nodes in the document, but ProseMirror's event loop captures the click to manage cursor position — so the native anchor navigation never fires.

The existing wikilink plugin (`wikilink.plugin.ts`) demonstrates the pattern: a `$prose` ProseMirror plugin with a `handleClick` prop that inspects the clicked DOM element and performs custom navigation. The same pattern is the correct approach for standard markdown links.

## Goals / Non-Goals

**Goals:**
- Clicking a rendered markdown link (`[text](url)`) opens the URL in a new browser tab.
- The plugin is a thin, self-contained ProseMirror plugin that mirrors `wikilink.plugin.ts` in structure.
- No new npm dependencies.

**Non-Goals:**
- Tooltip or hover preview of links.
- In-place editing of links via a toolbar (out of scope).
- Handling relative/internal links (wikilinks already cover that case).
- Ctrl/Cmd+Click distinction — a plain click is sufficient since ProseMirror already handles cursor placement; opening in a new tab avoids disrupting the editing session.

## Decisions

### Decision: Detect link by climbing the DOM, not by ProseMirror node type

**Choice**: In the `handleClick` prop, walk up from `event.target` looking for an `<a>` element with an `href`, then call `window.open(href, '_blank')`.

**Rationale**: Milkdown's `commonmark` preset renders links as real `<a>` nodes in the DOM. Reading `href` from the element is simpler and more robust than traversing the ProseMirror document model. The wikilink plugin already sets a precedent for DOM inspection in `handleClick`.

**Alternative considered**: Resolve the clicked position in the ProseMirror document and look up the `link` mark. Discarded — more brittle and requires knowing the internal mark name used by the preset.

### Decision: Open in a new tab (`_blank`), not in-place navigation

**Choice**: `window.open(href, '_blank', 'noopener,noreferrer')`.

**Rationale**: Users are in the middle of editing. Opening in-place would destroy unsaved work. New tab is the expected behavior for external links in wiki-like editors (e.g., Obsidian, Notion).

## Risks / Trade-offs

- **[Risk] Plugin intercepts ALL anchor clicks** → Mitigation: Only trigger when `el.href` is non-empty and not a `javascript:` URI; return `false` otherwise to let ProseMirror handle the event normally.
- **[Risk] Duplicate click handling with wikilinks** → No overlap: wikilinks are decorations with `.wikilink-token` class on text nodes (no `<a>` element), so both handlers can coexist without collision.
