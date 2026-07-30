# broken-links-modal-ux Specification

## Purpose
TBD - created by archiving change broken-links-modal-virtualscroll. Update Purpose after archive.
## Requirements
### Requirement: Virtualized rendering of the broken-links list
The broken-links modal SHALL render its list of entries using virtual scrolling, so that only the rows within (or immediately adjacent to) the visible viewport are materialized in the DOM. The number of DOM nodes SHALL remain roughly constant regardless of how many broken-link entries the scan returned.

#### Scenario: Large result set opens without rendering every row
- **WHEN** the modal opens with hundreds of broken-link entries
- **THEN** only the rows visible in the scroll viewport (plus a small buffer) are present in the DOM, and the remaining entries are rendered lazily as the user scrolls

#### Scenario: Scrolling reveals off-screen entries
- **WHEN** the user scrolls the list
- **THEN** rows entering the viewport are rendered and rows leaving the viewport are recycled/removed, while the file grouping remains visually intact

#### Scenario: Checkbox state survives virtualization
- **WHEN** the user toggles an entry's checkbox, scrolls it out of view, and scrolls it back
- **THEN** the checkbox reflects the same checked/unchecked state it had before being scrolled out of view

### Requirement: Search box filters displayed entries
The broken-links modal SHALL provide a text search input above the list. As the user types, the modal SHALL filter the displayed entries using a case-insensitive substring match against the link slug, the display alias, and the source file path. A file group SHALL be shown only if at least one of its entries matches the active query.

#### Scenario: Filter by link or alias
- **WHEN** the user types text that is a substring of an entry's link slug or display alias
- **THEN** only entries whose link slug or display alias contain that text (case-insensitive) remain visible

#### Scenario: Filter by source file path
- **WHEN** the user types text that is a substring of a source file path
- **THEN** the group for that file and all of its entries remain visible even if the individual link text does not match

#### Scenario: Empty query shows everything
- **WHEN** the search input is empty (or cleared)
- **THEN** all entries and groups are displayed

#### Scenario: No matches shows an empty state
- **WHEN** the active query matches no entries
- **THEN** the modal shows an inline "no results" message in place of the list, and no group headers are rendered

#### Scenario: Group header hidden when no entry matches
- **WHEN** a file group has no entry matching the active query
- **THEN** that group's header is not displayed

### Requirement: Filtering does not change selection or deletion scope
Search filtering SHALL affect only which entries are displayed. The selection set, the "Marcar/Desmarcar todos" action, the delete-button count, and the set of entries sent to the delete endpoint SHALL all be computed over the full scan result, independent of the active search query.

#### Scenario: Selection persists across filtering
- **WHEN** the user selects entries, applies a query that hides some of them, and then clears the query
- **THEN** the previously selected entries are still selected

#### Scenario: Marcar todos operates over the full result set
- **WHEN** a search query is active and the user clicks "Marcar todos"
- **THEN** all selectable (Related) entries in the full result set become selected, not only the currently visible ones

#### Scenario: Delete uses the full selection
- **WHEN** the user confirms deletion while a query is active
- **THEN** every selected Related entry is sent to the delete endpoint, including entries currently hidden by the filter

