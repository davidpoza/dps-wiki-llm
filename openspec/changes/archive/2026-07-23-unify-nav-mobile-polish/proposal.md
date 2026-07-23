## Why

The app currently exposes two parallel menus that are duplicated across pages: a top action bar (`username · theme toggle · explorer · settings · logout`) and a tab strip (`jobs · ingest · chat · review · changes`). Explorer and Settings are separate routed pages that re-implement their own top bars, so navigation is inconsistent, cluttered, and awkward on phones. Several actions are also misplaced (logout already lives in Profile; the theme toggle belongs in Settings), and the change-history screen hides its paginator on mobile. The result is a UI that is hard to use and looks unfinished on small screens.

## What Changes

- Introduce a **single, unified navigation menu** shared across all authenticated pages with exactly these destinations: **jobs, ingest, chat, review, changes, explorer, settings**. The active destination is derived from the current route.
- On mobile the unified menu collapses into a **hamburger menu**; on desktop it renders inline.
- **Remove the "Cerrar sesión" (logout) button** from the main menu — logout stays only on the Profile screen. **BREAKING** (UI): logout is no longer reachable from the top bar.
- **Remove the light/dark theme toggle button** from every top bar. Theme selection becomes an explicit **option inside the Settings screen**.
- **Fix change-history pagination on mobile** so the paginator is visible and usable on small screens.
- **Mobile polish pass** across all screens (home tabs, explorer, settings, profile, review, chat, ingest, jobs) so they are comfortably usable and visually consistent on phones.
- **Verify the result end-to-end using Chrome MCP** at mobile and desktop viewports.

## Capabilities

### New Capabilities
- `app-navigation`: A single route-aware navigation menu with a fixed set of destinations (jobs, ingest, chat, review, changes, explorer, settings), shared across all authenticated pages, that collapses to a hamburger menu on mobile and highlights the active destination. Logout is not part of this menu.
- `appearance-settings`: Light/dark theme selection presented as an explicit control within the Settings screen, replacing the top-bar toggle, persisted across sessions.
- `mobile-responsive-ui`: Baseline mobile usability and visual consistency for the authenticated screens, including a change-history paginator that remains visible and operable on small viewports.

### Modified Capabilities
<!-- No existing capability specs cover the frontend UI; all changes are net-new capabilities. -->

## Impact

- **Frontend (Angular / PrimeNG):**
  - New shared navigation component and its integration across pages.
  - `home.component.ts` — removes the top action bar buttons and the inline tab strip in favor of the shared nav; keeps tab-content switching.
  - `explorer.component.ts`, `settings.component.ts`, `profile.component.ts` — replace their bespoke top bars with the shared nav.
  - `settings.component.ts` — new appearance/theme control section.
  - `git-history.component.ts` — responsive paginator fix.
  - `theme.service.ts` — remains the source of truth for theme; consumed from Settings instead of the top bar.
  - `main.ts` routes — unchanged destination set (jobs/ingest/chat/review/git/explorer/settings/profile), but the "git" route is surfaced in the nav as "changes".
  - i18n: `assets/i18n/es.json` / `en.json` — new nav and settings labels; removal of now-unused toggle strings.
- **No backend changes.**
- **Verification:** Chrome MCP walkthrough at a phone viewport and a desktop viewport.
