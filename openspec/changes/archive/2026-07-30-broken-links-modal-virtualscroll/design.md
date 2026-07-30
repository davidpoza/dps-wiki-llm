## Context

`BrokenLinksModalComponent` (`frontend/src/app/components/broken-links-modal.component.ts`) is a standalone Angular component driven by signals. It receives a `brokenLinks: BrokenLinkEntry[]` input, groups the entries by `sourceFile` into a `groups` computed, and renders them inside a `p-dialog` with a plain `@for` loop over groups and, within each group, a nested `@for` over entries. Each entry row is a `p-checkbox` plus a label; Related entries are selectable, non-Related entries show a disabled checkbox and a section badge. Selection is tracked in a `selectedKeys` signal keyed by `` `${sourceFile}::${link}` ``.

Everything is rendered eagerly inside a `max-height: 50vh; overflow-y: auto` container, so a scan returning hundreds of entries mounts hundreds of checkbox nodes at open time. The project depends on `primeng ^21` and does **not** depend on `@angular/cdk`.

## Goals / Non-Goals

**Goals:**
- Keep the modal responsive (open + scroll) for large scan results via virtual scrolling.
- Let the user find a specific link or file quickly with a search box.
- Preserve every existing behavior: grouping, per-entry checkboxes, Related-vs-informational distinction, "Marcar/Desmarcar todos", delete-count label, confirm/cancel flow, and the component's public API (`brokenLinks` input; `cancel` / `confirmed` outputs).

**Non-Goals:**
- No changes to the scan/delete backend endpoints or DTOs.
- No change to selection semantics (delete still targets the full selection, not the filtered view).
- No new i18n; the modal keeps its existing hardcoded Spanish strings.
- No new npm dependency.

## Decisions

### Decision 1: Use PrimeNG `Scroller` for virtualization
Use the standalone `Scroller` component from `primeng/scroller` (already available via `primeng ^21`) as the virtual-scroll viewport, rather than adding `@angular/cdk` for `CdkVirtualScrollViewport`.

- **Why**: PrimeNG is already a first-class dependency and the modal already uses PrimeNG (`p-dialog`, `p-checkbox`, `p-button`); reusing it avoids pulling in `@angular/cdk` solely for scrolling and keeps styling consistent.
- **Alternatives considered**: (a) `@angular/cdk` `cdk-virtual-scroll-viewport` — clean API but adds a dependency the project has so far avoided. (b) Manual windowing with scroll listeners — more code and error-prone. (c) `p-table` with `[virtualScroll]` — too heavyweight for a simple grouped checkbox list.

### Decision 2: Flatten groups into a single virtual row list
Introduce a discriminated-union row model and feed a single flat array to the `Scroller`:

```ts
type Row =
  | { kind: 'header'; sourceFile: string }
  | { kind: 'item'; entry: BrokenLinkEntry };
```

A `filteredGroups` computed derives from `groups()` + the search `query` signal; a `rows` computed flattens `filteredGroups` into `[header, item, item, …, header, item, …]`. The `Scroller` iterates `rows` and the row template branches on `row.kind` (`@if`/`@switch`) to render either a file header or a checkbox item.

- **Why**: virtualizers window a flat list efficiently; nesting a virtual scroll per group is complex and defeats the purpose. Flattening keeps a single scroll context while preserving the grouped visual structure (headers are just rows).
- **Alternatives considered**: virtualize only within each group (many viewports, doesn't bound total DOM); keep groups but virtualize the group list (a single huge group is still eagerly rendered).

### Decision 3: Fixed item size with uniform row height
Configure the `Scroller` with a fixed `itemSize` (e.g. ~40px) and style header rows and item rows to that height band so windowing math stays simple and correct.

- **Why**: fixed-size windowing is the most reliable and cheapest; variable/auto-size measurement adds complexity for marginal benefit here.
- **Trade-off**: very long file paths or labels must ellipsize/truncate within the fixed row height instead of wrapping to multiple lines. Acceptable and arguably an improvement for dense lists (see Risks).

### Decision 4: Search is a pure view filter; selection stays global
Add a `query = signal('')` bound to a search input. `filteredGroups` filters entries by case-insensitive substring against `entry.link`, `entry.displayAlias`, and `entry.sourceFile`; a group is kept if any entry matches (a file-path match keeps all of that group's entries). `selectedKeys`, `allSelected`, `toggleAll`, `deleteLabel`, and `onConfirm` continue to operate over `brokenLinks()` (the full set), unchanged.

- **Why**: preserves the existing `broken-links-delete` contract exactly (default-all-selected, delete targets the full selection) with no spec modification, and avoids surprising selection churn as the user types.
- **Alternatives considered**: scope "Marcar todos"/deletion to the filtered subset — more intuitive for some flows but changes the established delete semantics and risks silently dropping selections as the query changes; deferred as a possible future refinement.

## Risks / Trade-offs

- **Entries can be selected but hidden by the filter** → the confirm button count and the delete confirmation dialog already state the exact number of links to be deleted, so the user sees the true scope before any backend call; document this behavior in the delete confirmation copy if needed.
- **Fixed row height truncates long paths/labels** → apply `text-overflow: ellipsis` with a `title`/tooltip carrying the full text so information is still reachable on hover.
- **PrimeNG `Scroller` sizing inside `p-dialog`** → the dialog is height-constrained (`maxHeight: 80vh`) and the list container was `max-height: 50vh`; the `Scroller` needs an explicit/bounded height to virtualize. Give the scroll viewport a fixed/`flex`-bounded height within the dialog body and verify the empty-state and small-list cases still look correct.
- **Group headers as rows** → because headers are interleaved rows, a group whose only matching entries scroll past the header still shows correct grouping; verify header/item visual distinction is preserved under virtualization.

## Open Questions

- Should "Marcar todos" eventually scope to the filtered subset? Left as a non-goal for now (Decision 4); revisit if users report it as confusing.
