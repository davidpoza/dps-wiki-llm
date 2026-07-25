## Why

When right-clicking an internal wikilink and selecting "Explicar enlace", the backend always returned 404 ("La nota enlazada no existe") because the raw wikilink target (e.g. `"My Note"`) was sent to the backend without being resolved to a full vault-relative path (e.g. `"folder/My Note.md"`).

## What Changes

- In `openLinkExplainModal()`, resolve the wikilink target to its actual vault-relative file path using the same lookup logic already used in `navigateToWikilink()`.
- Extract the resolution logic into a private `resolveWikilinkPath()` helper to avoid duplication.
- In `LinkExplainModalComponent.fetchExplanation()`, show "La nota enlazada no existe." when `sourcePath` or `targetPath` is null (i.e. the note wasn't found in the file tree) instead of silently doing nothing.

## Capabilities

### New Capabilities
- none

### Modified Capabilities
- none

## Impact

- `frontend/src/app/components/explorer.component.ts` — `openLinkExplainModal()` and new `resolveWikilinkPath()` helper.
- `frontend/src/app/components/link-explain-modal.component.ts` — `fetchExplanation()` null-guard with error message.
