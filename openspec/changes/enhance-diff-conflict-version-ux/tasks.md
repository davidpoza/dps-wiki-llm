## 1. Manual conflict merge editor (`conflict-merge-editor.component.ts`)

- [x] 1.1 Add `sync.mergeResultTitle` and `sync.mergeResultPlaceholder` keys to `frontend/src/assets/i18n/es.json` and `en.json`
- [x] 1.2 Bind the result-pane heading and textarea placeholder to the new Transloco keys, removing the hardcoded `Resultado` / `Escribe o pega…` literals
- [x] 1.3 Add a `@media (max-width: 600px)` block: stack `.source-panes` vertically (`flex-direction: column`), cap each source pane height so all panes scroll independently, and give the result pane a usable height instead of fixed `35%`
- [x] 1.4 On mobile, expand the dialog toward full-bleed (`100vw` / `100dvh`-style) and make the footer actions wrap/reach without horizontal clipping
- [x] 1.5 Improve changed-line highlighting legibility on both light and dark surfaces (contrast for `.line-changed` + source text)

## 2. Diff viewer (`git-history.component.ts`)

- [x] 2.1 Constrain the inline diff container so long lines scroll within the `<pre>` only (`max-width: 100%`), never causing page-level horizontal overflow
- [x] 2.2 Add/extend the `@media (max-width: 600px)` rules: reduce `.diff-pre` font-size/padding and confirm the diff stays inside its entry card
- [x] 2.3 Verify add/delete/hunk/meta line coloring stays legible against the dark diff surface after the mobile tweaks

## 3. File-versions modal (`explorer.component.ts`)

- [x] 3.1 Replace the fixed `[style]="{ width: '860px' }"` with a responsive width (e.g. `width: '90vw'`, `maxWidth: '860px'`)
- [x] 3.2 Add a `@media (max-width: 600px)` rule flipping `.versions-layout` to `flex-direction: column`, converting the fixed `240px` list width and `460px` height to fluid heights so list and preview stack usably
- [x] 3.3 Ensure the `.version-diff` preview contains long-line overflow within its own scroll area and the footer (cancel/restore) stays reachable on mobile

## 4. UX verification with Chrome DevTools MCP

- [x] 4.1 Ensure the app is running locally (backend port 8090 `local` profile + Angular dev server) and log in
- [x] 4.2 Diff viewer: open the changes/git-history screen, expand a diff; verify at a desktop viewport and a mobile viewport (~390×844) that there is no page horizontal overflow and the diff is legible (`take_snapshot` / `take_screenshot`)
- [x] 4.3 File-versions modal: open a file's versions modal; verify desktop side-by-side and mobile stacked layouts with no overflow and reachable footer actions
- [x] 4.4 Merge editor: open the manual merge editor (via a real or manufactured conflict); verify desktop three-pane and mobile stacked layout, translated result heading/placeholder, and reachable actions
- [x] 4.5 Capture before/after screenshots for each surface at both viewports and note any remaining issues

## 5. Validation

- [x] 5.1 Run the frontend build/lint (`ng build` and lint) and fix any errors introduced
- [x] 5.2 Confirm both `es` and `en` render the new merge-editor strings correctly
- [x] 5.3 Re-check the spec scenarios (no horizontal overflow, controls reachable, panes usable) are satisfied on all three surfaces
