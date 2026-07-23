## Context

The `DELETE /jobs/{id}` endpoint calls `JobLifecycleService.cancelJob`, which currently rejects any job not in `QUEUED` state with a 409 Conflict. Jobs in `AWAITING_REVIEW` have already had their baseline files written to disk (during `baseline-apply`), but the snapshot has not been finalized and link connections have not yet been applied. The review screen (`ReviewComponent`) has no way to dismiss a job — users are forced to complete the review even when they want to discard the result.

## Goals / Non-Goals

**Goals:**
- Let users delete/cancel a job in `AWAITING_REVIEW` state.
- Remove the cancelled job from the review screen without a page reload (SSE-driven).
- Reuse the existing `cancelJob` endpoint and `cancelJob` API method — no new endpoints.

**Non-Goals:**
- Reverting already-applied file changes on cancel. The baseline files are already on disk; a separate REVERT job handles that if the user wants it.
- Changing cancel behaviour for any other status (`STARTED`, `PROGRESS`, `COMPLETED`, etc.).

## Decisions

### Allow both QUEUED and AWAITING_REVIEW in cancelJob

**Decision**: Change the guard in `JobLifecycleService.cancelJob` from `status != QUEUED` to `status != QUEUED && status != AWAITING_REVIEW` (i.e., allow both).

**Alternative considered**: Create a separate `dismissReview(UUID)` method. Rejected — the outcome is identical (transition to CANCELLED + broadcast event), so adding a new code path would be unnecessary duplication.

### UI: button in ReviewComponent only (not JobsViewerComponent)

**Decision**: Add the delete button only to `ReviewComponent`. The `JobsViewerComponent` already shows the "AWAITING REVIEW" badge and a notice link; adding a cancel button there too is a separate UX decision not requested here.

**Alternative considered**: Also extend `canCancel` in `JobsViewerComponent` to include `AWAITING_REVIEW`. Deferred — out of scope for this change.

### Disappearance from review screen via existing SSE + store

No extra wiring needed: `cancelJob` broadcasts a `CANCELLED` event through `JobEventService`. The Angular `JobsStore` processes SSE events and updates job status in the signal map. `ReviewComponent.awaitingJobs` is a computed signal that filters for `AWAITING_REVIEW`, so once the store reflects `CANCELLED` the card disappears automatically.

## Risks / Trade-offs

- **Orphaned file changes**: Cancelling an AWAITING_REVIEW job leaves the baseline-applied files on disk. This is intentional and consistent with the existing REVERT workflow. Users who want to undo the file changes should enqueue a REVERT job.  
  → Mitigation: no action needed; REVERT already covers this case.

- **Race condition (review submitted simultaneously)**: If the user submits a review and cancels at nearly the same time, one request will win and the other will get a 409. Both outcomes (completed or cancelled) are coherent.  
  → Mitigation: the 409 is already handled gracefully by the UI.
