## Context

Jobs transition through `QUEUED → STARTED → PROGRESS → COMPLETED/FAILED/AWAITING_REVIEW`. If the JVM is killed while a job is in `PROGRESS` or `STARTED` (e.g., container redeploy, OOM kill), the job row stays in that state forever. There is no watchdog or heartbeat — only a user-triggered action can fix it.

The existing `cancel` operation (`DELETE /jobs/{id}`) only accepts `QUEUED` and `AWAITING_REVIEW` states. The user needs an equivalent escape hatch for in-flight jobs — one that marks them `FAILED` without rolling back any file changes they may have committed.

## Goals / Non-Goals

**Goals:**
- Allow a user to manually force a `PROGRESS` or `STARTED` job to `FAILED`.
- Record a clear error message so the job history explains what happened.
- Emit a SSE event so any open UI tab reflects the state change immediately.
- Expose the action via a REST endpoint and a UI button.

**Non-Goals:**
- Reverting git commits already made by the job — that is covered by the existing `revert` flow.
- Automatically detecting and recovering stuck jobs (no scheduler/watchdog in scope).
- Supporting any other source → target status transitions.

## Decisions

### D1: Target state is FAILED, not a new `ABANDONED` status

Using `FAILED` reuses existing UI rendering, SSE handling, and history display without any additional enum value or frontend branching. The error field (`"Abandoned by user"`) provides the human-readable distinction.

_Alternative considered_: Add `ABANDONED` to `JobStatus`. Rejected — more impact for no functional gain; `FAILED` already means "did not complete normally".

### D2: Separate endpoint `POST /jobs/{id}/abandon` (not overloading DELETE)

`DELETE /jobs/{id}` is already semantically "cancel queued job". A separate POST endpoint keeps intent explicit and makes access-control extension straightforward in the future.

_Alternative considered_: Add a `?force` query param to `DELETE`. Rejected — conflates two different operations and makes the controller harder to read.

### D3: Allowed source states are PROGRESS and STARTED only

`STARTED` is the brief window between dequeue and first `PROGRESS` broadcast; it is equally unrecoverable after a crash. Restricting to these two states prevents accidentally abandoning a job that is genuinely running.

## Risks / Trade-offs

- **Race condition**: If a job finishes naturally just before the user hits "Abandon", the force-fail will be rejected (409) because `transitionTo` or a guard will see a non-matching state. This is the safe outcome — the UI will update via SSE and the button will disappear.
- **No automatic cleanup**: Jobs left in PROGRESS after deploy do not self-heal; the user must notice and act. Acceptable for now (low frequency).

## Migration Plan

No schema changes. Deploy is a single backend + frontend artifact push. No rollback complexity.
