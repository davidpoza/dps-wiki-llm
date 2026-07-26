## ADDED Requirements

### Requirement: Job phase events with the same step update in place
When a job emits multiple SSE events that carry a `message` and share the same `step` value, the UI SHALL replace the existing phase entry for that step rather than appending a new row. At any point in time, each distinct `step` value SHALL appear at most once in the rendered phases list.

#### Scenario: Keyword regeneration progress does not accumulate
- **WHEN** a keyword regeneration job processes 512 files and emits 512 `step="progress"` events
- **THEN** the jobs panel SHALL show exactly one "progress" row, updated to the latest values, not 512 stacked rows

#### Scenario: Concept merge shows current group only
- **WHEN** a concept merge job processes multiple groups, emitting `step="merge"` for each
- **THEN** the jobs panel SHALL show one "merge" row that updates to the current group name, not one row per group

#### Scenario: Different steps still each appear
- **WHEN** a job emits events with distinct step names (e.g. "snapshot", "progress", "completed")
- **THEN** each distinct step SHALL appear as its own row in the phases list

### Requirement: Numeric progress events with updated/failed counts render as a live indicator
When a job emits a `step="progress"` event whose message is a JSON object containing `processed`, `total`, `updated`, and `failed` fields, the UI SHALL route this to the live-progress indicator (`currentActivity`) and SHALL display a human-readable percentage with `updated` and `failed` counts. The raw JSON string SHALL NOT be shown.

#### Scenario: Progress event routed to currentActivity
- **WHEN** a `step="progress"` event arrives with message `{"processed":45,"total":512,"updated":42,"failed":3}`
- **THEN** the UI SHALL show a progress indicator at approximately 8% with updated/failed counts, and SHALL NOT render the raw JSON string in the phases list

#### Scenario: Progress indicator clears after job completes
- **WHEN** the job transitions to COMPLETED or FAILED
- **THEN** the live progress indicator SHALL clear within 1.5 seconds, matching the existing `currentActivity` cleanup behaviour
