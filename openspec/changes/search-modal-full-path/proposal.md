## Why

The file search modal in the Explorer (`Ctrl+P`) only displays and searches by filename, making it impossible to distinguish files with the same name in different folders. Users can't tell which `index.md` or `notes.md` they're selecting when the vault has nested directories.

## What Changes

- Search results now show the full vault-relative path (e.g., `folder/subfolder/file.md`) below or alongside the filename
- The search filter matches against the full path, not just the filename, so typing a directory name surfaces relevant files
- Keyboard-navigation highlighting remains unchanged

## Capabilities

### New Capabilities

- `search-result-full-path`: Each result row in the file-search modal renders the full vault-relative path alongside the filename, and path text is included in the search filter match

### Modified Capabilities

<!-- None — this is purely additive UI behavior, no existing spec-level contracts change -->

## Impact

- `frontend/src/app/components/explorer.component.ts`: `filteredFiles` computed and the search result template in the `p-dialog`
- No backend changes needed — the full path is already available as `node.data` in the tree nodes
