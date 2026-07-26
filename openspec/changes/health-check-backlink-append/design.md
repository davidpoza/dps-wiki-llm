## Context

`HealthCheckService.discover()` iterates only the notes in the current `pathFilter` as sources. When it finds a semantic connection A→B it places both the forward link (`[[B]]` on A) and the backlink (`[[A]]` on B) in the `computed` map. `applyConnections` then writes all entries with `sectionReplacements`, which unconditionally overwrites the `Related` section of both A and B. If B was processed in a previous health-check run, its Related section accumulates only the links relevant to the current run — any previously written links not in this batch are silently removed.

## Goals / Non-Goals

**Goals:**
- Primary notes (in pathFilter, or all notes for a full run) continue to have their `Related` section fully replaced — idempotent reconciliation is preserved for notes you deliberately select.
- Backlink-only notes (discovered as targets but not in pathFilter) receive append-only writes: the new backlink is added if absent, existing Related content is never removed.
- When pathFilter is empty (full-vault run) every note is primary — behaviour is identical to today.

**Non-Goals:**
- No change to the connection-discovery algorithm, thresholds, or deduplication logic.
- No frontend changes.
- No new API endpoints or snapshot schema changes.

## Decisions

### 1. Track backlink-only paths inside `DiscoverResult`

`HealthCheckService.DiscoverResult` gains a `Set<String> backlinkOnlyPaths` field populated at the end of `discover()`: any path present in `computed` but absent from the effective `pathFilter` (when the filter is non-empty) is a backlink-only path.

**Why here and not in `applyConnections`**: the discovery loop is the right place to classify paths — it already knows which notes are sources. Pushing classification downstream would require passing `pathFilter` into `applyConnections`, tightening coupling unnecessarily.

### 2. `applyConnections` accepts `Set<String> backlinkOnlyPaths`

The method receives the new set from `DiscoverResult` and branches per entry:
- path NOT in `backlinkOnlyPaths` → `MutationAction` with `sectionReplacements` (replace entire Related)
- path in `backlinkOnlyPaths` → `MutationAction` with `sections` (merge/append, deduplication handled by `MarkdownService.mergeSection`)

`HealthCheckJobHandler` is updated to pass `discovered.backlinkOnlyPaths()` to `applyConnections`.

**Why not a new MutationActionType?** The existing `MutationApplier`/`MarkdownService` already supports both modes through the `sections` vs `sectionReplacements` parameters. No new abstraction needed.

### 3. Full-run (empty pathFilter) is unaffected

When `pathFilter` is empty all notes are iterated as sources, so `backlinkOnlyPaths` is always empty and all writes use replace mode. Existing behaviour and tests remain valid.

## Risks / Trade-offs

- **Stale backlinks in out-of-filter notes**: because we no longer replace, a backlink added to B in a previous run will persist even if the A–B connection is no longer above threshold in the current run. The stale link will only be cleaned up when B is included in a future health check selection. This is the intended trade-off — the user's design decision.
- **Idempotency key collision on repeated partial runs**: each action carries `health-check:<snapshotId>:<path>` as idempotency key, which is snapshot-scoped. Repeated runs on the same selection create new snapshots, so there is no collision risk.
