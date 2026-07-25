## Context

`HealthCheckService.discoverConnections` currently accumulates new links into the `Related` section by calling `MutationApplier` with a `sections` map (merge mode). `MarkdownService.mergeSection` appends only items not already present, so re-running health check never removes stale links — links from old semantic matches survive indefinitely.

There is no mechanism for users to preserve manually curated links across health-check rewrites because there is only one section (`Related`).

Relevant classes:
- `HealthCheckService` — orchestrates phases; builds `additions` map of new links per path
- `MutationAction` — domain record carrying `sections: Map<String, List<String>>` for merge-mode updates
- `MutationApplier` — applies actions by calling `MarkdownService.mergeAndRender`
- `MarkdownService.mergeSection` — appends deduplicated items to existing section content

## Goals / Non-Goals

**Goals:**
- Health check Phase 2 fully replaces the `Related` section on every run (idempotent output)
- User-curated links in `## Manual Links` are never touched by health check
- `MutationAction` and `MutationApplier` gain a generic replace-mode path usable by future callers
- `DEFAULT_SECTION_ORDER` in `MarkdownService` includes `Manual Links` for consistent document ordering

**Non-Goals:**
- Migrating existing notes (adding `Manual Links` sections to notes that already have `Related` content) — user responsibility
- Changing how `link-discovery-add-to-related` (the manual modal flow) writes links — it continues to append into `Related`
- UI changes beyond a minimal tooltip/hint explaining Manual Links

## Decisions

### Decision 1: Add `sectionReplacements` to `MutationAction`

`MutationAction` gets a new field `sectionReplacements: Map<String, List<String>>` (nullable). When non-empty, `MutationApplier` overwrites those sections entirely instead of merging.

**Alternative considered:** A boolean `replaceMode` on the whole action — rejected because it forces a binary choice; some future mutation may want to replace some sections while merging others.

**Alternative considered:** A new `MutationActionType.replace` variant — rejected because the action type is about what happens to the file (create/update/noop), not how individual sections are written.

### Decision 2: `MarkdownService` handles replacement in `mergeAndRender`

`mergeAndRender` gets an additional `Map<String, List<String>> sectionReplacements` parameter (null-safe). Sections in this map are rendered from their new list directly, bypassing `mergeSection`. All existing sections NOT in `sectionReplacements` are preserved as-is (including `Manual Links`).

**Alternative considered:** A separate `replaceAndRender` method — rejected to keep a single rendering path.

### Decision 3: Health check computes the full desired Related set per note

`HealthCheckService.discoverConnections` switches from tracking `additions` (delta) to tracking `computed` (full desired Related content per note). For each note, the final Related content is the union of all semantically discovered links in this run. The "connections found" count becomes total unique pairs discovered in the run.

The `existingLinks()` call is still used to avoid double-counting pairs already linked (`knownLinks` prevents re-counting a pair when the other note is processed).

**Alternative considered:** Keep `additions` as a delta and stitch old + new on the fly — rejected because the old links are already inside the note; we'd need to read each note a second time to reconstruct the full list, adding complexity with no benefit.

### Decision 4: `Manual Links` added to `DEFAULT_SECTION_ORDER`

`MarkdownService.DEFAULT_SECTION_ORDER` gains `"Manual Links"` placed between `Related` and `Sources`. This ensures it appears in a stable position when health check rewrites a note.

## Risks / Trade-offs

- **Existing Related content is wiped on first run after this change** → Users who have manually added links to `Related` (not `Manual Links`) will lose them. Mitigation: document the migration path in the settings UI tooltip; no auto-migration.
- **`MutationAction` signature change** → All callers constructing `MutationAction` must be updated. Mitigation: default the new field to `null`; existing calls passing 6 args must add a `null` 7th argument (or use a factory helper). Audit all construction sites before shipping.
- **`MarkdownService.mergeAndRender` signature change** → Same callsite audit needed. The overload is backward-compatible if we add a no-arg default or use an overloaded method.

## Migration Plan

1. Deploy backend changes (new field + replace logic).
2. On next health check run, each note's `Related` section is rewritten from scratch.
3. Users who had manual entries in `Related` should move them to `Manual Links` before or after the first post-deploy health-check run. A settings UI note will explain this.
4. No database or file-system migration script required.

## Open Questions

- Should `Manual Links` support the same `- [[wikilink]]` format as `Related`, or a looser free-text format? (Assumed: same wikilink format for consistency.)
- Should the broken-links scanner skip `Manual Links` or scan it too? (Assumed: scan it — broken links are broken regardless of section.)
