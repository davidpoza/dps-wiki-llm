## Why

The frontend currently has PrimeNG dark-mode support configured but no user-facing way to enable it or persist a preference. Users working in the knowledge UI for long sessions need a darker theme that applies consistently across navigation, forms, dialogs, editors, and loading states.

## What Changes

- Add a dark-mode preference for the Angular frontend.
- Provide a visible theme toggle in the authenticated application shell.
- Apply the selected theme by adding or removing the PrimeNG `.dark` selector on the document root.
- Persist the selected theme locally so refreshes and future sessions keep the same appearance.
- Respect the system color-scheme preference when no explicit local preference exists.
- Ensure global styles, layout surfaces, markdown/editor areas, overlays, and PrimeNG components remain readable in both light and dark themes.

## Capabilities

### New Capabilities
- `ui-theme-preference`: User-selectable and persistent frontend theme preference covering light mode, dark mode, and initial system preference detection.

### Modified Capabilities

## Impact

- Affects Angular frontend bootstrapping and root layout components.
- Affects global and component SCSS for theme tokens and dark-mode-specific surfaces.
- May add a small frontend-only service for theme state and persistence.
- No backend API, ingestion pipeline, RabbitMQ, vault, PostgreSQL, or semantic index changes.
