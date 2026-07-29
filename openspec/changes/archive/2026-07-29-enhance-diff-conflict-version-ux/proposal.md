## Why

The three diff/version surfaces of the app — the manual conflict merge editor, the unified diff viewer in the changes screen, and the file-versions modal — were built desktop-first and have accumulated UX gaps: the merge editor packs both source panes side-by-side with no mobile layout and ships hardcoded Spanish strings; the diff viewer forces horizontal scrolling for long lines; and the versions modal uses a fixed 860px width that overflows narrow viewports. On a phone these surfaces are cramped or unusable, which breaks the app's stated "fully responsive" contract for authenticated screens.

## What Changes

- **Manual conflict merge editor** (`conflict-merge-editor.component.ts`):
  - Add a responsive mobile layout: stack the local/remote source panes vertically (or tab between them) and give the result pane usable height instead of a fixed 35%.
  - Replace the hardcoded `Resultado` header and result-pane placeholder with Transloco i18n keys.
  - Improve change highlighting readability (clear "take local / take remote" affordances and legible changed-line emphasis on both light and dark surfaces).
- **Diff viewer** (unified diff in `git-history.component.ts`):
  - Make long diff lines readable on mobile (wrap or horizontally scroll within the card without breaking the surrounding layout).
  - Improve add/delete/hunk legibility and ensure the diff container fits mobile viewports without page-level horizontal overflow.
- **File-versions modal** (`explorer.component.ts`):
  - Replace the fixed 860px width with a responsive width that fits mobile viewports.
  - Stack the versions list and preview vertically on mobile so both remain usable; keep the side-by-side layout on desktop.
- **UX verification**: validate all three surfaces at a desktop and a mobile viewport using the Chrome DevTools MCP (no horizontal overflow, controls reachable, panes usable) before marking the change done.

No backend/API changes. No breaking changes.

## Capabilities

### New Capabilities
- `merge-editor-ux`: Responsive, fully-internationalized manual conflict merge editor with legible change highlighting on desktop and a usable stacked/tabbed layout on mobile.
- `diff-viewer-ux`: Readable unified diff rendering in the changes screen that adapts to mobile viewports without page-level horizontal overflow.
- `file-versions-modal-ux`: Responsive file-versions modal that fits mobile viewports and stacks its list/preview panes on narrow screens while keeping the desktop side-by-side layout.

### Modified Capabilities
<!-- These enhancements refine existing behavior but are captured as focused new capabilities, following the repo's granular convention (changes-mobile-card, jobs-mobile-layout). No existing requirement text is being invalidated. -->

## Impact

- **Frontend code**:
  - `frontend/src/app/components/conflict-merge-editor.component.ts` (template, styles, i18n bindings)
  - `frontend/src/app/components/git-history.component.ts` (diff viewer template/styles + mobile breakpoints)
  - `frontend/src/app/components/explorer.component.ts` (file-versions modal template/styles + mobile breakpoints)
  - `frontend/src/assets/i18n/es.json` and `en.json` (new keys for `sync.mergeResultTitle`, `sync.mergeResultPlaceholder`)
- **Related existing specs** (behavior enhanced, not replaced): `conflict-resolution-options`, `git-history`, `clean-diff-output`, `file-version-preview`, `mobile-responsive-ui`.
- **Verification**: Chrome DevTools MCP driving the running local app (backend on port 8090, `local` profile) at desktop and mobile viewport sizes.
- No database, API, or dependency changes.
