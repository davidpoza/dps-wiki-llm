## 1. Domain & Service changes

- [x] 1.1 Add `backlinkOnlyPaths` field (`Set<String>`) to `HealthCheckService.DiscoverResult` record
- [x] 1.2 Populate `backlinkOnlyPaths` in `HealthCheckService.discover()`: after the discovery loop, collect every key in `computed` that is absent from `pathFilter` (only when `pathFilter` is non-empty)
- [x] 1.3 Update `HealthCheckService.applyConnections()` signature to accept `Set<String> backlinkOnlyPaths`
- [x] 1.4 In `applyConnections()`, build each `MutationAction` with `sectionReplacements` for primary paths and with `sections` (merge/append) for paths in `backlinkOnlyPaths`

## 2. Handler wiring

- [x] 2.1 Update `HealthCheckJobHandler.run()` to pass `discovered.backlinkOnlyPaths()` to `applyConnections`

## 3. Tests

- [x] 3.1 Add unit test: partial health check on {A} that finds A→B — verify B's Related is appended-to (not replaced) and A's Related is replaced
- [x] 3.2 Add unit test: partial health check on {A, B} — verify both A's and B's Related sections are fully replaced
- [x] 3.3 Add unit test: full run (empty pathFilter) — verify all Related sections are fully replaced (no regression)
- [x] 3.4 Add unit test: repeated partial run with {A} — verify backlink `[[A]]` appears exactly once in B's Related even after two runs
