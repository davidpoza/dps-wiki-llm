## 1. Template — add tree ViewChild reference

- [x] 1.1 Add `#fileTree` template reference variable to the files `<p-tree>` element in `explorer.component.ts`
- [x] 1.2 Import `Tree` from `'primeng/tree'` and add `@ViewChild('fileTree') fileTree?: Tree` to the component class

## 2. Logic — ancestor expansion and scroll helpers

- [x] 2.1 Add `private expandAncestors(nodes: TreeNode[], filePath: string): boolean` that walks the tree recursively, sets `node.expanded = true` on every non-leaf node whose `data` path is a strict ancestor of `filePath`, and returns `true` if any node was mutated
- [x] 2.2 Add `private getFlatVisibleIndex(nodes: TreeNode[], targetPath: string): number` that walks the tree in display order (counting visible rows respecting `expanded` state) and returns the zero-based index of the node with `data === targetPath`, or `-1` if not found
- [x] 2.3 Add `private revealInTree(path: string): void` that: (1) calls `expandAncestors`; (2) if any ancestors were expanded, calls `this.treeNodes.update(n => [...n])` to trigger signal reactivity; (3) schedules a `setTimeout(0)` that calls `this.fileTree?.scroller?.scrollToIndex(this.getFlatVisibleIndex(this.treeNodes(), path))`

## 3. Call sites — trigger reveal on programmatic file open

- [x] 3.1 In `loadFileByPath`, after setting `this.selectedNode = node`, call `this.revealInTree(path)` — guarded so it only runs when `navigatingFromTree` is `false`
- [x] 3.2 In the `loadTree` callback, after setting `this.selectedNode = node` (when a `currentPath` is already selected), call `this.revealInTree(currentPath)`
