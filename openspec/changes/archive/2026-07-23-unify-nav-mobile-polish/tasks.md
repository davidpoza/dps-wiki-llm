## 1. Shared navigation component

- [x] 1.1 Create standalone `NavComponent` (`frontend/src/app/components/nav.component.ts`) that renders the seven destinations in order — jobs, ingest, chat, review, changes (→ `/git`), explorer, settings — as `routerLink`s with `routerLinkActive` highlighting.
- [x] 1.2 Add a Profile/username affordance in the nav (links to `/profile`); it is the entry point that replaces the logout button. No logout control and no theme toggle in the nav.
- [x] 1.3 Implement responsive behavior: inline horizontal list above the mobile breakpoint; below `max-width: 768px` hide the list and show a hamburger button that toggles an overlay/drawer panel with the same links.
- [x] 1.4 Add a `menuOpen` signal; selecting a destination navigates and resets `menuOpen` so the mobile panel dismisses. Ensure correct active state for `/git` ("changes") and deep `/explorer/**` routes.
- [x] 1.5 Style the nav (desktop + mobile) to match the existing app tokens (`--app-*` CSS variables) and be visually consistent across pages.

## 2. Integrate nav and remove the old menus

- [x] 2.1 In `home.component.ts`, remove the top action bar buttons (theme toggle, explorer, settings, logout) and the standalone tab strip; render `<app-nav>` instead while keeping the `tab-content` switch driven by the route.
- [x] 2.2 In `explorer.component.ts`, replace the bespoke top bar (theme toggle + logout) with `<app-nav>`; verify the full-height two-pane layout still fits below the nav.
- [x] 2.3 In `settings.component.ts`, replace the top bar (theme toggle) with `<app-nav>`.
- [x] 2.4 In `profile.component.ts`, add `<app-nav>` at the top so the profile screen shares the unified menu; confirm the existing logout control remains on this screen only.
- [x] 2.5 Remove now-unused `ThemeService`/logout wiring from `home.component.ts` and `explorer.component.ts` top bars.

## 3. Theme selection in Settings

- [x] 3.1 Add an "Appearance" section to `settings.component.ts` with a Light/Dark control (PrimeNG `SelectButton`) bound to `ThemeService` (`setTheme(...)`, reflecting `isDark()`).
- [x] 3.2 Verify selecting a theme applies immediately (no reload) and persists across reloads via existing `ThemeService` localStorage behavior.

## 4. Change-history pagination on mobile

- [x] 4.1 In `git-history.component.ts`, ensure the `<p-paginator>` wrapper is not clipped by an `overflow`/fixed-width container on small screens.
- [x] 4.2 Reduce the paginator footprint on mobile (fewer page-link buttons / simplified template) so it fits within the viewport without horizontal clipping, keeping the `@if (totalElements() > pageSize)` gate.
- [x] 4.3 Confirm next/previous paging loads and renders the correct page at a mobile viewport.

## 5. Mobile polish pass

- [x] 5.1 Audit each authenticated screen (jobs, ingest, chat, review, changes, explorer, settings, profile) for horizontal overflow at a phone width and fix offending fixed widths / non-wrapping rows.
- [x] 5.2 Ensure primary actions and inputs remain reachable and comfortably tappable on mobile; adjust spacing/typography as needed using existing tokens.

## 6. Internationalization

- [x] 6.1 Add nav destination labels and the Settings "Appearance"/theme labels to `assets/i18n/es.json` and `assets/i18n/en.json`.
- [x] 6.2 Remove now-unused theme-toggle strings and any dangling logout/menu keys; grep to confirm no references remain.

## 7. Verification (Chrome MCP)

- [x] 7.1 Build/serve the frontend and walk through all seven destinations at a desktop viewport (~1280px): nav inline, active highlighting correct, no logout or theme toggle in the nav.
- [x] 7.2 Repeat at a mobile viewport (~390px): hamburger appears, opens/closes, navigates and dismisses; no horizontal page overflow on any screen.
- [x] 7.3 Verify the Settings theme control switches light/dark immediately and persists after reload.
- [x] 7.4 Verify the change-history paginator is visible and pages correctly on the mobile viewport.
- [x] 7.5 Confirm logout is present on the Profile screen and absent everywhere else; capture screenshots of key screens at both viewports.
