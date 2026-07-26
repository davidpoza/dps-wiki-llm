## Context

`jobs.store.ts` handles SSE job events in `handleEvent()`. The relevant branch (line ~142):

```typescript
} else if (event.message) {
  next.phases = [...existing.phases, { step: event.step, message: event.message }];
}
```

This appends unconditionally. Any job handler that emits the same `step` name in a loop produces duplicate phase rows:

- `KeywordRegenerationJobHandler`: `step="progress"`, message = `{"processed":N,"total":512,...}` — one per file
- `ConceptMergeJobHandler`: `step="merge"`, message = `"Merging group → <filename>"` — one per group

Health-check (`step="embeddings"/"connections"`) and `-scan` steps are already routed to `currentActivity` and do not accumulate. The fix brings the remaining cases into line with that established pattern.

## Goals / Non-Goals

**Goals:**
- Replace any existing phase with the same step name instead of appending (general guard).
- Route `step="progress"` JSON events to `currentActivity` with parsed `updated`/`failed` counts.
- Extend `ScanActivity` with optional `updated`/`failed` fields and surface them in the template.

**Non-Goals:**
- Changing backend event format or payload.
- Showing historical per-step log (current design: last value wins — intentional).
- Changing health-check or `-scan` handling (already correct).

## Decisions

### 1. Find-and-replace by step in phases (general guard)

Before the `else if (event.message)` append, check `existing.phases.findIndex(p => p.step === event.step)`. If found, replace; if not, append. This is a one-liner change that guards all current and future repeat-step patterns.

Alternative: only special-case known high-frequency steps. Rejected — the general guard is safer and requires no maintenance when new job types are added.

### 2. Route step="progress" JSON to currentActivity

After the general guard, add a branch that intercepts `step === 'progress'` events where `event.message` parses as `{processed, total, updated, failed}` and sets `currentActivity` (label="progress", percent, updated, failed) — skipping phases entirely.

This is consistent with the health-check pattern and avoids raw JSON appearing in the phases list even if the general guard is applied.

Alternative: format the JSON as a readable string and keep it in phases. Rejected — `currentActivity` already has dedicated template rendering with better visual treatment.

### 3. Extend ScanActivity type

Add `updated?: number` and `failed?: number` to `ScanActivity` in `types.ts`. Existing callers that don't set these fields are unaffected (fields are `undefined`). The template shows the counts conditionally.

## Risks / Trade-offs

- [History loss] With find-and-replace, `ConceptMergeJobHandler` will only show the current (last) merge group, not the full list. This is the correct UX trade-off for long-running loops — the goal is "what is happening now", not a complete log.
- [No backend coordination] If a future job handler intentionally emits the same step with distinct semantics, it will hit the replace logic. Naming convention (unique step names per distinct phase) should be the convention going forward.

## Migration Plan

Frontend-only. No deploy sequencing required.

## Open Questions

None.
