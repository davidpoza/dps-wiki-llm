## Why

Emoji characters used in note names or content (e.g. `📁 Proyectos`, `✅ Tareas`) appear as empty boxes on Linux and some Android browsers because the primary typeface (`Inter`) carries no emoji glyphs and those platforms may have no system emoji font installed. Windows and macOS render them fine thanks to built-in Segoe UI Emoji / Apple Color Emoji. Making emoji reliable across all platforms is needed to support multi-platform teams using the wiki.

## What Changes

- **Global CSS font-family** (`styles.scss`): add the four canonical emoji font names — `"Apple Color Emoji"`, `"Segoe UI Emoji"`, `"Noto Color Emoji"`, `"Segoe UI Symbol"` — as explicit fallbacks in the `body` font stack. Browsers already prefer emoji fonts for emoji code points, but listing them explicitly ensures correct resolution order on every OS.
- **Google Fonts preload** (`index.html`): add a `<link>` to load `Noto Color Emoji` from Google Fonts. This provides a web-font fallback for Linux and Android environments where `Noto Color Emoji` is not installed at the OS level. The load is non-blocking and degrades gracefully when the app is used offline.

No JS library, no new npm dependency, no backend changes. Emoji then render correctly wherever they appear: file-tree node labels, changes/jobs path lists, markdown note content.

## Capabilities

### New Capabilities

- `emoji-rendering-support`: Cross-platform emoji rendering via CSS font-family extension and Noto Color Emoji web font.

### Modified Capabilities

- `frontend-experience`: The global font stack gains emoji font fallbacks, which is a change to the base rendering behaviour of all text in the app.

## Impact

- **`frontend/src/styles.scss`**: one-line edit to `body` `font-family`.
- **`frontend/src/index.html`**: two `<link>` tags (preconnect + stylesheet) for Google Fonts Noto Color Emoji.
- No backend, no new packages, no breaking changes.
