## Context

Three UI surfaces render diff/version content in the Angular frontend:

1. **Manual conflict merge editor** — `conflict-merge-editor.component.ts`. A PrimeNG `p-dialog` fixed at `95vw × 90vh` with two source panes (`flex: 1` each) side-by-side above a `flex: 0 0 35%` result textarea. It has no `@media` rules, so on a phone the two panes collapse to unusably narrow columns. The result heading (`Resultado`) and textarea placeholder are hardcoded Spanish literals; all other strings already use Transloco. Changed-line highlighting is index-based (`own[i] !== other[i]`) with a single `.line-changed` class.

2. **Diff viewer** — inside `git-history.component.ts`. Each change entry can expand an inline unified diff rendered in a dark `<pre class="diff-pre">` with `white-space: pre; overflow-x: auto`. Line classes (`line-add`, `line-del`, `line-hunk`, `line-meta`) are already applied. The component has a `@media (max-width: 600px)` block that stacks the *conflict* panes, but the inline diff `<pre>` relies solely on horizontal scroll. The conflicts dialog and the merge editor are hosted here.

3. **File-versions modal** — inside `explorer.component.ts` (~lines 644–687, styles ~1284–1370). A `p-dialog` with a hardcoded `width: '860px'` and a `.versions-layout` flex row (`240px` list + preview at fixed `460px` height). No `@media` rule, so `860px` overflows sub-860px viewports and the row never stacks.

Constraints: Angular 21 standalone components, signal-based state, PrimeNG dialogs, Transloco i18n (`es.json`/`en.json`), CSS custom properties for theming (`--app-*`). Backend runs on port 8090 under the `local` profile; no backend/DevTools hot-reload, but this change is frontend-only (served by the Angular dev server / `ng serve`). The existing mobile breakpoint convention in the codebase is `@media (max-width: 600px)`.

## Goals / Non-Goals

**Goals:**
- Give all three surfaces a usable mobile layout with no page-level horizontal overflow, following the existing `max-width: 600px` breakpoint convention.
- Remove the two hardcoded Spanish literals in the merge editor and route them through Transloco (`es.json` + `en.json`).
- Keep the desktop layouts essentially as-is; mobile is additive via media queries.
- Verify the result at both a desktop and a mobile viewport with the Chrome DevTools MCP before marking the change complete.

**Non-Goals:**
- No backend, API, or data-model changes.
- No change to the diff *algorithm* on the backend (`clean-diff-output` behavior stays). The merge editor's client-side line comparison stays index-based; only its presentation improves.
- No new npm dependencies (no dedicated diff-rendering library).
- No redesign of the desktop layouts beyond what's needed for legibility.

## Decisions

- **CSS media queries over JS viewport detection.** Each component already ships scoped `styles`; adding `@media (max-width: 600px)` blocks keeps behavior declarative, avoids `ChangeDetection` churn, and matches how `git-history` and `changes-mobile-card` already handle mobile. Alternative considered: a `signal`-driven `isMobile` flag toggling template branches — rejected as heavier and inconsistent with the codebase.
- **Merge editor mobile: stack panes vertically over tabs.** Stacking (local pane, remote pane, result pane in a column, each scrollable) is a pure-CSS change to `.source-panes { flex-direction: column }` plus height caps. A tabbed source switcher would need new component state and markup. Stacking is lower-risk and sufficient for usability; tabs remain a future option. The dialog also switches from `95vw × 90vh` to a full-bleed `100vw`/`100dvh` feel on mobile to reclaim space.
- **Diff viewer mobile: contain overflow, keep monospace.** Keep the dark monospace `<pre>` but ensure the diff container is width-constrained (`max-width: 100%`, `overflow-x: auto` scoped to the `<pre>`, never the card) so horizontal scroll stays inside the diff, not the page. Reduce font-size/padding at the breakpoint. Alternative considered: soft-wrapping long lines — rejected as default because it corrupts alignment of code/markdown diffs; container-scoped horizontal scroll preserves fidelity.
- **Versions modal: responsive width + stacked layout.** Replace fixed `width: '860px'` with a responsive style (e.g. `width: '90vw'` capped by `maxWidth: '860px'`) and add a `@media (max-width: 600px)` rule flipping `.versions-layout` to `flex-direction: column`, converting the fixed `240px`/`460px` dimensions to fluid heights. The `p-dialog` style binding is set in the template, so responsiveness comes from the `maxWidth` cap plus the media query on the inner layout.
- **i18n keys.** Add `sync.mergeResultTitle` and `sync.mergeResultPlaceholder` to both catalogs, bind them in the merge editor template. Reuse existing `sync.*` namespace for cohesion with `sync.mergeEditorTitle`.
- **Verification via Chrome DevTools MCP.** Drive the running app to reproduce each surface, then `resize_page` to a mobile width (e.g. 390×844) and a desktop width, `take_snapshot`/`take_screenshot`, and confirm no horizontal overflow and reachable controls. This satisfies the user's explicit "usa chrome mcp para garantizar UX" directive and the mobile scenarios in the specs.

## Risks / Trade-offs

- **[Reaching the conflict/merge surfaces requires an actual sync conflict, which is hard to trigger on demand]** → For UX verification, drive the components directly (navigate to the changes/git-history screen for the diff viewer and versions modal; if a live conflict can't be produced, verify the merge editor layout by temporarily rendering it with mock conflict data in the dev build, or capture it from a manufactured conflict). Prefer real data where feasible.
- **[Container-scoped horizontal scroll on mobile can be easy to miss/hard to discover]** → Keep it as the fallback for genuinely long lines only; most markdown diff lines fit or wrap acceptably. Ensure the scroll region is visually bounded (border/background) so users see it is scrollable.
- **[`100vw`/full-bleed dialog on mobile can fight PrimeNG's default dialog centering/margins]** → Use PrimeNG's `[style]`/`:host ::ng-deep` overrides already used elsewhere in these components; verify against the actual `p-dialog` DOM via the MCP snapshot.
- **[Missing i18n key silently renders the key path]** → Add both `es.json` and `en.json` entries in the same task and eyeball both languages during verification.

## Migration Plan

Frontend-only, no data migration. Ship the component edits and i18n keys together. Rollback is a straight revert of the touched files. Verify with `ng build`/lint and the Chrome DevTools MCP UX pass before merge.

## Open Questions

- Merge editor mobile: is vertical stacking acceptable, or is a tabbed local/remote switcher preferred? (Design assumes stacking; tabs deferred.)
- Should long diff lines soft-wrap or horizontally scroll by default on mobile? (Design assumes container-scoped horizontal scroll to preserve alignment.)
