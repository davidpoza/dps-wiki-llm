## ADDED Requirements

### Requirement: Cancel job in AWAITING_REVIEW state
The system SHALL allow cancelling a job whose status is `AWAITING_REVIEW` via the existing `DELETE /jobs/{id}` endpoint, transitioning it to `CANCELLED` and broadcasting the status change.

#### Scenario: Successful cancel of AWAITING_REVIEW job
- **WHEN** a `DELETE /jobs/{id}` request is made for a job in `AWAITING_REVIEW` status
- **THEN** the job status transitions to `CANCELLED`
- **THEN** a CANCELLED SSE event is broadcast to all connected clients
- **THEN** the response is HTTP 204 No Content

#### Scenario: Cancel rejected for non-cancellable status
- **WHEN** a `DELETE /jobs/{id}` request is made for a job in `STARTED`, `PROGRESS`, `COMPLETED`, `FAILED`, or `REVERTED` status
- **THEN** the response is HTTP 409 Conflict

### Requirement: Delete button in review screen
The review screen SHALL display a "Delete" button on each AWAITING_REVIEW job card, allowing the user to cancel that job without completing the link-connection review.

#### Scenario: User deletes a job from review screen
- **WHEN** the user clicks the "Delete" button on a job card in the review screen
- **THEN** a DELETE request is sent for that job
- **THEN** the job card disappears from the review screen once the CANCELLED SSE event is received

#### Scenario: Review screen is empty after all jobs are deleted
- **WHEN** the last AWAITING_REVIEW job is cancelled via the delete button
- **THEN** the review screen shows the empty-state message
