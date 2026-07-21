## Why

The change history view shows the file path for each entry as plain text, giving no quick way to navigate to that file for editing. Users have to manually open the explorer and locate the file, adding unnecessary friction when reviewing recent changes.

## What Changes

- The `file-path` span in each history entry row becomes a clickable link that navigates to `/explorer/<path>`, opening the file in the markdown editor.

## Capabilities

### New Capabilities

- `history-file-link`: Clickable file path in the change history that opens the file in the markdown editor via Angular router navigation.

### Modified Capabilities

<!-- none -->

## Impact

- `frontend/src/app/components/git-history.component.ts` — add `Router` injection and convert `.file-path` span to a router-navigating element.
- No backend changes required.
- No new dependencies.
