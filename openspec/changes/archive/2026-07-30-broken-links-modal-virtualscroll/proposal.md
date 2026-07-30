## Why

The "Enlaces rotos encontrados" modal renders every broken-link entry eagerly inside a scrollable container. On vaults with many broken links (a full-content scan can return hundreds of entries across dozens of files), the modal renders one DOM node per entry up front, which makes opening the modal and scrolling sluggish. There is also no way to locate a specific link or file within a long list — the user must scroll manually.

## What Changes

- Render the broken-links list with **virtual scrolling** so only the rows currently in view are materialized in the DOM, keeping the modal responsive regardless of how many entries were found.
- Add a **search box** at the top of the modal that filters the visible entries as the user types, matching against the link slug, its display alias, and the source file path.
- Preserve all existing modal behavior: per-file grouping, per-entry checkboxes, the Related-vs-informational distinction, "Marcar/Desmarcar todos", and the delete-confirmation flow. Filtering only changes what is displayed; selection state and the delete request continue to operate over the full result set.

## Capabilities

### New Capabilities
- `broken-links-modal-ux`: Virtualized rendering and text-search filtering for the broken-links modal, so large scan results stay performant and searchable while preserving the existing grouping, selection, and deletion semantics.

### Modified Capabilities
<!-- No spec-level requirement changes to broken-links-scan / broken-links-delete / broken-links-full-scan: grouping, checkbox selection, Related-only deletion, and confirmation flow are unchanged. -->

## Impact

- **Frontend**: `frontend/src/app/components/broken-links-modal.component.ts` — introduce a virtual-scroll viewport (PrimeNG `Scroller`, already available via `primeng ^21`) and a search input with a filter signal. No changes to `settings.component.ts` wiring (same `[brokenLinks]` input and `cancel`/`confirmed` outputs).
- **Dependencies**: none added — reuses the existing PrimeNG dependency.
- **Backend**: none — scan and delete endpoints and DTOs are unchanged.
