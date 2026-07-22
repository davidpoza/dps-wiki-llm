## Context

The ingest pipeline's `concept-resolution` phase runs `ConceptResolutionService.resolve()` which silently processes each concept `create` action — either keeping it (new concept) or rewriting it as an `update` to an existing concept (deduplication). No SSE events are emitted and no trace is stored, leaving the user without visibility into what concepts were proposed or whether they were merged.

Additionally, note file paths in the jobs screen (`JobsViewerComponent`) and changes screen (`GitHistoryComponent`) are rendered as plain `<span>` elements. Users must manually navigate to notes, while the underlying `router.navigate(['explorer', ...path.split('/')])` pattern already exists in both `GitHistoryComponent` and other components.

## Goals / Non-Goals

**Goals:**
- Emit SSE `concept-proposal` events during concept resolution so the jobs screen shows proposals live.
- Persist proposals in the DB so the jobs screen shows them as a permanent trace after the job completes.
- Return concept proposals from the jobs API so they are available on page refresh.
- Make file paths in `JobsViewerComponent` (files list, currentActivity path) clickable.
- Make path text in `GitHistoryComponent` clickable (the icon button already works).

**Non-Goals:**
- Concept proposals in the review screen (that screen is for connection candidates, not concept dedup).
- Clickable paths in the `review.component.ts` (not requested).
- Modifying concept resolution logic or thresholds.

## Decisions

### 1. ConceptResolutionService returns proposals — does not emit SSE itself

`ConceptResolutionService.resolve()` has no `Job` dependency. Rather than injecting `JobLifecycleService` into it (widening its responsibility), `resolve()` returns a new result type `ConceptResolutionResult(MutationPlan plan, List<ConceptProposal> proposals)`. `IngestPipelineService` then calls `lifecycleService.conceptProposals(job, proposals)` which both persists and broadcasts.

**Alternative considered**: Pass `Job` into `resolve()`. Rejected — mixes domain logic with lifecycle concerns and complicates testing.

### 2. Proposals persisted in a new `concept_proposals` jsonb column

A dedicated `concept_proposals jsonb` column on the `jobs` table keeps concept proposals separate from `result` (which is an arbitrary pipeline output) and `affectedPaths` (which tracks files). This makes the field addressable by API and avoids coupling the `result` format to the proposal shape.

**Alternative considered**: Embed proposals in the `result` JSON. Rejected — `result` already has varied semantics across job types; sharing the column creates fragile coupling.

### 3. SSE event format reuses existing `PROGRESS` type with step `concept-proposal`

The frontend `SseJobEvent` interface and SSE listener already handle any step string. A `concept-proposal` step with `message = proposedTitle` and `result = JSON(ConceptProposal)` requires no new SSE event type. The frontend store accumulates these into `JobState.conceptProposals[]`.

### 4. Frontend: proposals loaded from API on history merge

`JobsStore.mergeHistory()` maps `conceptProposals` from `JobSummary` so completed jobs show their proposals immediately on page load, without requiring SSE replay.

### 5. Clickable paths: button wrapping in jobs screen, span made interactive in changes screen

In `JobsViewerComponent`, each `.file-path` span is replaced with a `<button>` (consistent with `GitHistoryComponent`'s existing `.editor-btn` pattern). The `currentActivity.path` also becomes a button. `Router` is injected into `JobsViewerComponent`.

In `GitHistoryComponent`, the path text `<span class="file-path">` gets `(click)="openFile(entry.path)"` and `cursor: pointer` CSS, complementing the existing icon button without removing it.

## Risks / Trade-offs

- [Migration]: Adding `concept_proposals` column is additive and non-breaking. Existing rows get `NULL`/default `[]`. No data loss. → Flyway migration is straightforward.
- [SSE volume]: High-concept-count articles could emit many `concept-proposal` events. Each event is small and the phase is already bounded by the number of `create` actions in the plan. No throttling needed.
- [Backwards compat]: `JobSummary` gains a new nullable field. Frontend handles `null` as empty list. No breaking change.

## Migration Plan

1. Flyway migration: `ALTER TABLE jobs ADD COLUMN concept_proposals jsonb DEFAULT '[]'`.
2. Update `Job` entity, `JobSummary` DTO, and `JobController` serialization.
3. Add `ConceptProposal` record and `ConceptResolutionResult` record.
4. Modify `ConceptResolutionService.resolve()` to return `ConceptResolutionResult`.
5. Add `lifecycleService.conceptProposals()` method.
6. Update `IngestPipelineService` to handle the new result type.
7. Frontend: add types, update store, update components.

Rollback: remove the Flyway migration (column is additive), revert code changes. No data migration needed.
