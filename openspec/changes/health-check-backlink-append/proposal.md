## Why

When a health check processes note A and discovers a link A→B, it writes the backlink B→A to B's `Related` section using a full **replace**, which destroys any other links B had in that section from a previous run (B may have been processed under a different path-filter selection). Backlinks to notes outside the current selection should be **additive**: append the link only if absent, never clobber the rest of the section.

## What Changes

- **Backlink writes use append-mode**: when a discovered connection adds a backlink to a note that is NOT in the current path-filter, the `Related` section of that target note is updated by appending the missing link only — existing content is preserved.
- **Primary-note writes continue to use replace-mode**: a note that IS in the path-filter (or all notes when no filter is set) still has its `Related` section fully replaced with the freshly computed set, keeping the idempotent full-reconciliation behavior intact.
- No behavioral change when the path-filter is empty (full vault run): every note is a "primary" note, so replace-mode applies to all.

## Capabilities

### New Capabilities

_(none — this is a behaviour refinement of an existing capability)_

### Modified Capabilities

- `vault-health-check`: the bidirectional link-writing rule changes — the target note's `Related` section is no longer unconditionally replaced; it is replaced only when the target is itself in the current selection, and appended-to otherwise.
- `health-check-idempotent-related`: the "fully overwrite on every run" guarantee now applies only to the **primary** (selected) notes; out-of-selection backlink targets receive append-only writes.

## Impact

- `HealthCheckService` — `DiscoverResult` record gains a `backlinkOnlyPaths` set; `applyConnections` uses `sectionReplacements` for primary paths and `sectionUpdates` (merge/append) for backlink-only paths.
- `HealthCheckJobHandler` — passes `discovered.backlinkOnlyPaths()` to `applyConnections`.
- No API, frontend, or dependency changes.
