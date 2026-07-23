## Context

The document viewer/editor (`document-viewer.component.ts`) already stores the full vault-relative path in the `filePath` signal (set from the route segments at `filePath.set(path)`). The header currently renders only the last segment:

```html
<h2 class="viewer-filename">{{ filePath()!.split('/').pop() }}</h2>
```

This is a presentation-only change confined to that component's template and styles. No backend, API, or data model changes are involved.

## Goals / Non-Goals

**Goals:**
- Show the full vault-relative path in the header while keeping the filename the visually dominant element.
- Keep the header readable and layout-stable across desktop and narrow/mobile viewports.

**Non-Goals:**
- Making path segments clickable/navigable (breadcrumb navigation) — out of scope; this is display-only.
- Changing how `filePath` is derived, routing, or any backend/data behavior.
- Showing an absolute filesystem path or the vault root name — the path is vault-relative only.

## Decisions

**Decision: Split the path into folder segments + filename in the template, style them differently.**
Render the leading directory portion (`dir/` part) in a muted style and the final filename segment emphasized, e.g. two spans: `<span class="viewer-path-dir">research/papers/</span><span class="viewer-path-name">note.md</span>`. Derive both parts from `filePath()` in the template (or a small computed) rather than adding state.
- *Rationale:* Preserves the current visual hierarchy (filename stands out) while adding the folder context. Keeps the change minimal and stateless.
- *Alternatives considered:* (a) Show the raw path with uniform styling — simpler but loses the filename emphasis and looks noisy. (b) A full breadcrumb component — more work and implies navigation semantics we explicitly excluded.

**Decision: Handle overflow with CSS rather than JS truncation.**
Allow the path to wrap (`word-break`/`overflow-wrap`) or ellipsis-truncate within the content column so long paths never push the layout. Prefer wrapping the directory portion and keeping the filename visible.
- *Rationale:* CSS-only keeps it robust and dependency-free; the header lives inside the already-constrained `.viewer-content` (max-width 860px) and mobile styles.

## Risks / Trade-offs

- [Very deep paths still look long] → Muted directory styling plus wrapping keeps them unobtrusive; filename remains emphasized so the header stays scannable.
- [Empty/edge paths (root-level file)] → When there is no directory portion, render only the filename span with no leading separator (matches the root-level scenario in the spec).
