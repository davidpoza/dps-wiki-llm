## Context

The frontend is a standalone Angular app (PrimeNG + Transloco) bootstrapped in `frontend/src/main.ts`. Authenticated destinations are routed as:

- `jobs`, `ingest`, `chat`, `review`, `git` → all resolve to `HomeComponent`, which reads the first route segment and switches an internal tab (`activeTab` signal).
- `explorer` → `ExplorerComponent` (full-height, custom two-pane layout).
- `settings` → `SettingsComponent`.
- `profile` → `ProfileComponent` (already hosts the logout control).

Today each of `HomeComponent`, `ExplorerComponent`, and `SettingsComponent` renders **its own top bar**, and `HomeComponent` additionally renders a **tab strip**. This produces two menus, duplicated per page, with inconsistent contents (theme toggle and logout appear in top bars; destinations are split between top-bar buttons and tabs). `ThemeService` (`services/theme.service.ts`) is already the single source of truth for the theme and persists to `localStorage`.

Constraints: frontend-only change, no backend/API changes, keep the existing route set, keep `ThemeService` as-is, reuse PrimeNG components already in the app.

## Goals / Non-Goals

**Goals:**
- One shared, route-aware navigation menu with destinations `jobs, ingest, chat, review, changes, explorer, settings`, present on every authenticated page.
- Collapse to a hamburger on mobile; inline on desktop.
- Remove logout from the nav (keep it in Profile); remove the theme toggle from all top bars and move theme selection into Settings.
- Fix the change-history paginator on mobile and do a general mobile polish pass.
- Verify with Chrome MCP at mobile + desktop viewports.

**Non-Goals:**
- No change to routes/destinations themselves (the `git` route stays; it is merely labeled "changes" in the nav).
- No redesign of individual screen internals beyond what mobile usability requires.
- No new theming system — continue using `ThemeService` and the `.dark` selector.
- No backend or i18n-language changes beyond adding/removing the affected labels.

## Decisions

### Decision 1: A shared, route-aware `NavComponent` embedded per page (not a shell/outlet rewrite)

Create a standalone `NavComponent` (`components/nav.component.ts`) rendered at the top of `HomeComponent`, `ExplorerComponent`, `SettingsComponent`, and `ProfileComponent`. It renders the seven destinations plus a Profile/username affordance.

- **Rationale:** Minimal routing disruption. `ExplorerComponent` has a bespoke full-height layout and its own scroll containers; wrapping all authenticated routes in a parent shell with a single `<router-outlet>` risks breaking that layout and the existing tab-content mechanism. Embedding a small shared component keeps each page's layout intact while giving a single source of truth for the menu.
- **Active state:** Use Angular `routerLink` + `routerLinkActive` per destination so highlighting is automatic and correct, including "changes" → `/git`.
- **Alternative considered — parent shell layout with child routes:** architecturally tidy (one nav instance, one outlet) but a larger refactor that touches every route and risks regressions in Explorer's full-height layout; rejected for this change to keep blast radius small.

### Decision 2: Custom inline links + hamburger overlay for responsiveness

`NavComponent` renders the destinations as an inline horizontal list on desktop. At/below the mobile breakpoint the list is hidden and replaced by a hamburger button that toggles an overlay/drawer panel containing the same links; selecting a link navigates and closes the panel (via a `menuOpen` signal reset on navigation).

- **Rationale:** Full control over styling for the mobile polish goal, and `routerLinkActive` continues to drive active state in both layouts. Avoids fighting `p-menubar`'s model API to get correct route-based active highlighting.
- **Breakpoint:** collapse to hamburger at `max-width: 768px` (phones/small tablets); introduce it as a single shared value and reuse it. Existing per-screen tweaks at `600px` remain valid.
- **Alternatives considered:** `p-menubar` (native responsive hamburger, but route-aware active styling is awkward and the `end` slot styling is fiddly) and CSS-only `:target`/checkbox toggles (hacky, poor a11y). Rejected in favor of a small signal-driven toggle. A PrimeNG Drawer may be used for the mobile panel if it yields a more polished slide-in; a plain absolutely-positioned overlay is acceptable.

### Decision 3: Theme selection moves into Settings

Remove the sun/moon toggle from `HomeComponent`, `ExplorerComponent`, and `SettingsComponent` top bars. Add an "Appearance" section to `SettingsComponent` with an explicit Light/Dark control bound to `ThemeService` (`setTheme(...)` / `isDark()`), so the choice applies immediately and persists (unchanged persistence behavior).

- **Rationale:** Settings is the natural home for a preference; the top bar becomes cleaner. `ThemeService` already exposes everything needed.
- **Control choice:** a two-option PrimeNG `SelectButton` (Light | Dark) for an explicit, labeled selection rather than an ambiguous icon toggle. A `ToggleSwitch` is an acceptable alternative.

### Decision 4: Logout removed from nav, retained in Profile

Delete the logout button from the `HomeComponent` and `ExplorerComponent` top bars. `NavComponent` contains no logout control. `ProfileComponent` remains the only place to log out (already implemented).

### Decision 5: Make the change-history paginator mobile-friendly

In `git-history.component.ts`, ensure the `<p-paginator>` wrapper is not clipped by an `overflow`/fixed-width container on small screens and reduce the paginator's footprint on mobile (e.g., fewer page-link buttons / simplified template so prev-next and current page fit within the viewport without horizontal clipping). Confirm the `@if (totalElements() > pageSize)` gate still renders and the control is reachable.

- **Rationale:** The paginator currently disappears/clips on mobile; the fix is layout/responsive, not logic.

## Risks / Trade-offs

- **Explorer layout regression** → Explorer's full-height two-pane layout must still fit once the shared nav sits above it. Mitigation: verify Explorer at mobile + desktop in Chrome MCP; keep the nav compact and account for its height in Explorer's available space.
- **Duplicated nav height across pages** → embedding rather than a single outlet means the nav mounts per page. Mitigation: it is a lightweight standalone component; acceptable and avoids the larger refactor.
- **Active-state edge cases** (`/git` labeled "changes", `/explorer/**` deep routes) → Mitigation: use `routerLinkActive` with appropriate match options and verify each destination highlights correctly.
- **Losing logout discoverability** → some users may look for logout in the menu. Mitigation: it remains reachable via the username/Profile affordance in the nav → Profile screen.
- **i18n drift** → new nav/settings keys must exist in both `es.json` and `en.json`; removed toggle strings must not leave dangling references. Mitigation: grep for removed keys during implementation.

## Migration Plan

Pure frontend change; no data or API migration. Deploy is a normal frontend build. Rollback is reverting the change's commit(s). No feature flag required.

## Open Questions

- Mobile panel style: PrimeNG Drawer (slide-in) vs. a plain absolute overlay — decide during implementation based on which looks cleaner; both satisfy the spec.
- Whether the username/Profile affordance sits inside the hamburger panel on mobile or stays as a persistent avatar/link next to the hamburger — decide during the mobile polish pass.
