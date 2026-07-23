## 1. Update Search Filter Logic

- [x] 1.1 In `filteredFiles` computed signal, change the filter predicate from matching `n.label` to matching `(n.data as string)` so the full vault-relative path is included in the search

## 2. Add Path Helper Method

- [x] 2.1 Add `searchResultPath(node: TreeNode): string` method to `ExplorerComponent` that returns the directory portion of `node.data` (everything before the last `/`), or `''` for root-level files

## 3. Update Search Result Template

- [x] 3.1 In the search modal `p-dialog` template, update each `.search-result` row to call `searchResultPath(file)` and conditionally render a `<span class="search-result-path">` subtitle when it is non-empty
- [x] 3.2 Add `.search-result-path` CSS rule to the component styles: small font, muted color, `overflow: hidden; text-overflow: ellipsis; white-space: nowrap`

## 4. Verification

- [x] 4.1 Open Explorer, press Ctrl+P, type a folder name — verify files in that folder appear even if the filename doesn't match
- [x] 4.2 Confirm files in nested directories show the directory path as a subtitle in each result row
- [x] 4.3 Confirm root-level files show no subtitle
- [x] 4.4 Confirm keyboard navigation (ArrowUp/Down/Enter) still works correctly
