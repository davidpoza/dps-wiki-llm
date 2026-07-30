## 1. Search state and filtering

- [x] 1.1 Add a `query = signal('')` to `BrokenLinksModalComponent` for the search text
- [x] 1.2 Add a `filteredGroups` computed that filters `groups()` by case-insensitive substring against `entry.link`, `entry.displayAlias`, and `entry.sourceFile`, keeping a group when its path matches or when at least one entry matches
- [x] 1.3 Add a `hasResults` (or reuse `filteredGroups().length`) helper to drive the "no results" empty state
- [x] 1.4 Confirm `selectedKeys`, `allSelected`, `toggleAll`, `deleteLabel`, and `onConfirm` still operate over `brokenLinks()` (full set), not the filtered subset

## 2. Flatten groups into a virtual row model

- [x] 2.1 Define the `Row` discriminated union (`{ kind: 'header'; sourceFile }` | `{ kind: 'item'; entry }`)
- [x] 2.2 Add a `rows` computed that flattens `filteredGroups()` into the interleaved header/item array
- [x] 2.3 Add a stable `trackBy`/`track` key for rows (e.g. `header:<file>` and `item:<entryKey>`)

## 3. Virtual scroll + search box UI (PrimeNG Scroller)

- [x] 3.1 Import `Scroller` from `primeng/scroller` and add it to the component `imports`
- [x] 3.2 Add a search input (bound to `query` via `ngModel`) at the top of the modal body, with a clear affordance
- [x] 3.3 Replace the eager `groups-list` `@for` with a `p-scroller` over `rows()`, using a fixed `itemSize` and a bounded viewport height inside the dialog body
- [x] 3.4 In the scroller item template, branch on `row.kind` to render either the file header or the checkbox item (reuse existing label/slug/section-badge markup and the `p-checkbox` with `isChecked`/`toggle`/Related-only `disabled`)
- [x] 3.5 Render the inline "no results" message when a query is active and `rows()` is empty; keep the existing "No se encontraron enlaces rotos" empty state when `brokenLinks()` is empty

## 4. Styling

- [x] 4.1 Set header rows and item rows to a uniform height matching `itemSize`
- [x] 4.2 Apply `text-overflow: ellipsis` + `title` tooltip to long file paths and link labels so truncated text stays reachable
- [x] 4.3 Style the search input consistently with the existing modal / app theme variables

## 5. Verification

- [x] 5.1 Verify with a large result set that only viewport rows are in the DOM and scrolling reveals/recycles rows
- [x] 5.2 Verify filtering by link/alias and by file path, the empty-state on no matches, and that hidden groups' headers disappear
- [x] 5.3 Verify selection persists across filtering, "Marcar todos" marks all Related entries regardless of query, and delete sends the full selection (including filtered-out entries)
- [x] 5.4 Verify checkbox state is preserved when an entry is scrolled out of view and back
- [x] 5.5 Run the frontend lint/build to confirm no type or template errors
