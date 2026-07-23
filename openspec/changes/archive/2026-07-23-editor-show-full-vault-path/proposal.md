## Why

The document viewer/editor header currently shows only the bare filename (e.g. `note.md`), which is ambiguous when the vault contains many files with the same name in different folders. Showing the full path within the vault gives the user immediate context about where the open document lives.

## What Changes

- The editor header shows the document's **full path within the vault** (e.g. `research/papers/note.md`) instead of just the filename.
- The path is rendered readably: intermediate folders are visually de-emphasized while the filename remains the emphasized part, so the header stays scannable.
- Long paths wrap or truncate gracefully so they do not break the topbar/header layout on narrow (mobile) viewports.

## Capabilities

### New Capabilities
- `document-viewer-header`: Defines how the document viewer/editor header presents the identity of the open document — showing its full vault-relative path with the filename emphasized.

### Modified Capabilities
<!-- None: no existing spec in openspec/specs/ covers the viewer header. -->

## Impact

- **Frontend (editor)**: `frontend/src/app/components/explorer.component.ts` — the `.editor-title` header (currently `selectedLabel()`, just the filename). This is the editable editor the user works in; `selectedPath()` already holds the full vault-relative path.
- **Frontend (read-only viewer)**: `frontend/src/app/components/document-viewer.component.ts` — the `.viewer-filename` header (currently `filePath()!.split('/').pop()`). Same treatment for consistency.
- No backend, API, or data changes. The full path is already available in-component; this is a presentation-only change.
