## Why

Jobs in `AWAITING_REVIEW` state are currently stuck: the only way to proceed is to complete the review, even if the user wants to discard the job entirely (e.g., erroneous ingestion, duplicate). The cancel endpoint rejects non-QUEUED jobs, and the review screen has no dismiss action.

## What Changes

- Extend the backend cancel endpoint to accept jobs in `AWAITING_REVIEW` state (in addition to `QUEUED`), transitioning them to `CANCELLED`.
- Add a "Delete" button to each job card in the review screen (`ReviewComponent`), so users can dismiss a job without completing the link-connection review.
- The job disappears from the review screen immediately upon cancellation via the existing SSE-driven store update.

## Capabilities

### New Capabilities

- `cancel-awaiting-review-job`: Allows cancelling a job in `AWAITING_REVIEW` state. Covers backend permission change and the review-screen UI action.

### Modified Capabilities

<!-- None -->

## Impact

- **Backend**: `JobLifecycleService.cancelJob` — loosen the status guard to also accept `AWAITING_REVIEW`.
- **Frontend**: `review.component.ts` — add a delete button per job card that calls the existing `cancelJob` API method.
- **No new API endpoints**, no schema changes, no snapshot/file-revert logic needed (already-applied file changes remain; users can revert via the existing REVERT job if desired).
