## ADDED Requirements

### Requirement: Emit per-file SSE progress events during connection-discovery
During the `connection-discovery` pipeline step, the system SHALL emit one SSE event of type `PROGRESS` per file evaluated (both LLM suggestions and semantic search results), using `step = "connection-discovery-scan"`, `message = <file path>`, and `result = {"current":<n>,"total":<m>}` where `n` is the 1-based index of the current file and `m` is the total number of files to evaluate.

#### Scenario: LLM suggestion evaluated
- **WHEN** the connection-discovery step processes a LLM mutation action of type `update`
- **THEN** the system SHALL emit a PROGRESS SSE event with `step = "connection-discovery-scan"`, `message` equal to the action's target path, and `result` as a JSON string `{"current":<n>,"total":<m>}`

#### Scenario: Semantic search result evaluated
- **WHEN** the connection-discovery step iterates over semantic search results
- **THEN** for each result that passes the score threshold and is not the source note, the system SHALL emit a PROGRESS SSE event with `step = "connection-discovery-scan"`, `message` equal to the result's path, and `result` as a JSON string `{"current":<n>,"total":<m>}`

#### Scenario: Result below threshold skipped
- **WHEN** a semantic search result has a score below 0.72 or is the source note itself
- **THEN** the system SHALL NOT emit a progress event for that result

### Requirement: Frontend displays active scanning file with percentage without accumulating history
The frontend jobs viewer SHALL display the currently-scanned file path and completion percentage as a transient live indicator during `connection-discovery`, separate from the phase history list, without accumulating past scan entries.

#### Scenario: Scanning event received for active job
- **WHEN** the frontend receives a PROGRESS SSE event with a step ending in `-scan`
- **THEN** the `currentActivity` field of the corresponding `JobState` SHALL be set to `{ path: event.message, percent: Math.round((current/total)*100) }` parsed from `event.result`, and the event SHALL NOT be added to the `phases` array

#### Scenario: Subsequent scanning event replaces previous
- **WHEN** the frontend receives a second PROGRESS SSE event with step `connection-discovery-scan` for the same job
- **THEN** `currentActivity` SHALL be overwritten with the new path and percentage (not appended)

#### Scenario: Job reaches terminal state
- **WHEN** the frontend receives a terminal event (COMPLETED, FAILED, REVERTED) for a job
- **THEN** `currentActivity` SHALL be set to `null`

### Requirement: Scanning indicator visible in jobs viewer with percentage
The jobs viewer component SHALL render `currentActivity` as a visible inline element below the phase list when the value is non-null, displaying both the file path and the completion percentage.

#### Scenario: Active scan in progress
- **WHEN** a job has `currentActivity` set to a non-null value and its status is `PROGRESS`
- **THEN** the jobs viewer SHALL display a label such as "scanning", the file path in monospace, and the percentage in the format `(23%)`

#### Scenario: No active scan
- **WHEN** `currentActivity` is null
- **THEN** the scanning indicator SHALL NOT be rendered
