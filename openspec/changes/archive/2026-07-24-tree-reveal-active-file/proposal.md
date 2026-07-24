## Why

When a note is opened via URL, global search, link click, or the changes/jobs views, the file-tree panel does not reveal the active file: parent folders remain collapsed and the selected node is not scrolled into view. The user has no visual orientation about where in the hierarchy the open note lives.

## What Changes

- When a file is loaded (via route navigation, direct URL, or internal `loadFileByPath` calls), expand all ancestor folder nodes in the file tree so the active file becomes visible.
- After expanding, scroll the virtual-scroll tree to bring the highlighted node into view.
- The same reveal behaviour applies when the tree reloads (e.g., after a save) and a file is already selected.
- No reveal is triggered when the user clicks a node themselves — the node is already visible in that case.

## Capabilities

### New Capabilities

- `tree-reveal-active-file`: Automatic reveal and scroll-to-selection in the file-tree panel when a file is opened programmatically.

### Modified Capabilities

_(none — no existing spec-level requirement changes)_

## Impact

- **`frontend/src/app/components/explorer.component.ts`**: add `@ViewChild('fileTree')`, add `#fileTree` template reference on `<p-tree>`, add `revealInTree(path)` and `getFlatVisibleIndex(nodes, path)` helpers, call `revealInTree` from `loadFileByPath` and from the `loadTree` callback.
- No backend changes, no new dependencies.
