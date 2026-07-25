## Why

Health check currently appends newly discovered links to the `Related` section without ever removing stale ones, so each run accumulates more links and the result differs depending on prior history. This makes the feature non-idempotent and pollutes notes with outdated auto-links that the user cannot easily distinguish from intentional ones.

## What Changes

- Health check Phase 2 **replaces** the entire `Related` section with the freshly computed set of links on every run (no accumulation).
- A new `## Manual Links` section is introduced as the designated place for user-curated links that should survive health-check rewrites.
- Health check never reads from or writes to `## Manual Links`; it is purely user-managed.
- `MarkdownService` gets a new section-write mode — "replace" — used by health check to overwrite `Related` rather than merge into it.
- The vault-health-check spec is updated to reflect the replace-not-append contract and the Manual Links convention.

## Capabilities

### New Capabilities

- `health-check-idempotent-related`: Health check rewrites the `Related` section from scratch on each run and preserves user-curated links in a separate `Manual Links` section.

### Modified Capabilities

- `vault-health-check`: The "Only new links are added without duplication" requirement changes to "Related section is fully replaced by each run"; Manual Links section is introduced as the user escape hatch.

## Impact

- `HealthCheckService` — `discoverConnections` and `applyAdditions`: change mutation action from additive merge to full replace for `Related`.
- `MarkdownService` — `mergeAndRender` / `mergeSection`: add a replace-mode path so callers can overwrite a section instead of appending.
- `MutationAction` domain object (or a new field/variant): signal replace vs. merge for a given section update.
- Frontend `settings.component.ts` — UI hint or tooltip explaining Manual Links section (minimal change).
- `vault-health-check/spec.md` — requirement update.
