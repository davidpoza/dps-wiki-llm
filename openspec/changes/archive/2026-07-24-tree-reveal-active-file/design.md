## Context

`ExplorerComponent` holds the file tree in `treeNodes: signal<TreeNode[]>`. The PrimeNG Tree renders with `virtualScroll="true"` and `scrollHeight="flex"`, which means only visible rows exist in the DOM. `loadFileByPath(path)` and the `loadTree()` callback both find the leaf `TreeNode` by `data === path` and assign it to `selectedNode`, but neither expands ancestors nor scrolls the scroller.

## Goals / Non-Goals

**Goals:**
- Expand all ancestor folders when a file is opened programmatically.
- Scroll the virtual-scroll tree to the selected node's position.

**Non-Goals:**
- Revealing the node when the user opens it by clicking it in the tree (already visible).
- Animating or highlighting the node beyond PrimeNG's default selection style.

## Decisions

### Mutate `expanded` in-place then signal-update to trigger re-render

PrimeNG Tree reacts to the `[value]` binding. We mutate `node.expanded = true` on each ancestor node (found by walking the tree recursively by path prefix), then call `this.treeNodes.update(n => [...n])` to replace the top-level array reference and trigger Angular's signal graph. A shallow clone of the root array is sufficient because PrimeNG traverses children by reference.

Alternative considered: `restoreExpanded` pattern (return new tree) — unnecessary overhead and risk of losing other expanded state.

### `@ViewChild` on `<p-tree>` for scroller access

PrimeNG `Tree` exposes `this.tree.scroller` (a `Scroller` component) which has `scrollToIndex(index: number)`. We add `@ViewChild('fileTree') fileTree!: Tree` and a `#fileTree` template ref on the files `<p-tree>`. After expanding and triggering the signal update we schedule `scrollToVirtualIndex` in a `setTimeout(0)` to run after Angular's next render cycle.

Alternative considered: `querySelector('.p-highlight')?.scrollIntoView()` — fails with virtual scroll because the node may not yet be in the DOM.

### Flat visible index calculation

PrimeNG's virtual scroller requires a flat integer index into the visible node list. We walk the tree in display order: each non-leaf expanded node counts as one row, then recurse into its children. Collapsed or leaf nodes count as one row but do not recurse. This mirrors PrimeNG's own node flattening logic.

### Skip reveal when navigating from tree (`navigatingFromTree` flag)

The existing `navigatingFromTree` boolean is already set before `router.navigate` in `openFile`. We guard `revealInTree` with the same flag: if `navigatingFromTree` is true we skip the reveal (node is already visible). The flag is cleared in `ngOnInit`'s route subscription, exactly as before.

## Risks / Trade-offs

- **`setTimeout(0)` race**: If Angular's rendering takes longer than one task (e.g., very slow device), the scroll may fire before the new rows are in the virtual scroller. Mitigation: the node remains selected; the user just sees it without the auto-scroll. A 50 ms fallback timer can be used if needed in practice.
- **Scroller API availability**: `this.fileTree?.scroller` may be undefined on PrimeNG versions < 17. The optional-chain guard (`?.`) makes this a silent no-op — expanding still works, only scroll is skipped.
