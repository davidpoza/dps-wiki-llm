## Context

The Explorer component (`explorer.component.ts`) has a file-search modal triggered by Ctrl+P or the sidebar search button. Results are rendered from the `filteredFiles` computed signal, which:

- Filters `allFiles()` (flat list of `TreeNode`) by `n.label?.toLowerCase().includes(q)`
- Renders each result as `<span [innerHTML]="file.label"></span>` — filename only

Each `TreeNode` already has `data: string` holding the full vault-relative path (e.g., `folder/subfolder/note.md`). No backend changes are needed.

## Goals / Non-Goals

**Goals:**
- Display the directory portion of the path as a secondary, muted line in each search result row
- Include the full path in the filter predicate so typing a folder name surfaces matching files
- Keep keyboard navigation (ArrowUp/Down, Enter) working unchanged

**Non-Goals:**
- Full-text content search (searching inside file bodies)
- Fuzzy/ranked search — incremental substring matching is sufficient
- Changing the wikilink autocomplete dropdown (separate concern)

## Decisions

### 1. Filter on full path, not just label

**Decision**: Change `filteredFiles` to match against `(n.data as string).toLowerCase()` instead of `n.label`.

**Why**: A file named `notes.md` can exist in many folders. Searching `cardiology/notes` should narrow to the right one. Matching against the full path is strictly more useful with no downside.

**Alternative considered**: Keep label filter, add a second path filter with OR — rejected because matching both separately with OR means typing `notes` still returns every `notes.md` without the ability to disambiguate by folder.

### 2. Render path as a secondary subtitle in the result row

**Decision**: In the search result template, render the directory part of `node.data` as a second line with muted styling, below the filename.

**Why**: Separating the filename (bold) from the path (muted, smaller) follows common file-picker patterns (VS Code, JetBrains) and keeps the filename visually prominent while providing context.

**Alternative considered**: Render the full path in one line — rejected because it makes the filename harder to scan quickly.

### 3. Extract dir/name split in the template inline using a helper

**Decision**: Add a `searchResultPath(node: TreeNode): string` helper method that returns the directory portion (everything before the last `/`), returning `''` for root files. Render it only when non-empty.

**Why**: Keeps template logic clean; avoids duplicating the split logic already used in `selectedPathParts`.

## Risks / Trade-offs

- **Long paths**: Deep vault hierarchies produce long path strings. Mitigated by `text-overflow: ellipsis` on the path subtitle element (consistent with existing `.file-path-dir` style).
- **HTML injection via label**: `[innerHTML]` is already used for `file.label` (for bold-match highlighting). The new path is rendered with plain text binding `{{ }}`, so no additional XSS risk.
