## Why

The "Regenerar keywords" modal shows only the filename of each note (e.g., `my-concept`), making it impossible to distinguish notes with the same name in different subdirectories. Additionally, the modal only loads notes from `wiki/concepts` and `wiki/sources`, ignoring any notes stored in other subdirectories under `wiki/`.

## What Changes

- The note row in the modal displays the full vault-relative path (e.g., `wiki/concepts/my-concept.md`) instead of just the filename.
- The modal loads notes from the entire `wiki/` subtree, not just the two hardcoded folders.
- The description text in the Settings screen is updated to reflect the wider scope.

## Capabilities

### New Capabilities

<!-- none -->

### Modified Capabilities

- `keyword-regeneration-ui`: The modal now queries all of `wiki/` and displays full vault-relative paths instead of bare filenames.

## Impact

- `frontend/src/app/components/keyword-selection-modal.component.ts` — template and `load()` method
- `frontend/src/app/components/settings.component.ts` — section description text
- `openspec/specs/keyword-regeneration-ui/spec.md` — requirement update
