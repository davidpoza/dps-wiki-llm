## ADDED Requirements

### Requirement: ConceptResolutionService exposes proposals
`ConceptResolutionService.resolve()` SHALL return a `ConceptResolutionResult` containing both the resolved `MutationPlan` and a `List<ConceptProposal>`, where each `ConceptProposal` records the proposed concept path, proposed title, whether it was deduplicated, and the resolved path (the existing concept it was merged into, if any).

#### Scenario: New concept — no duplicate found
- **WHEN** a concept `create` action has no semantic match above threshold
- **THEN** a `ConceptProposal` is produced with `deduplicated = false` and `resolvedPath = null`

#### Scenario: Duplicate found — action rewritten to update
- **WHEN** a concept `create` action matches an existing concept above the similarity threshold
- **THEN** a `ConceptProposal` is produced with `deduplicated = true` and `resolvedPath` set to the matched concept's path

#### Scenario: Non-concept action skipped
- **WHEN** the mutation action path does not start with `wiki/concepts/`
- **THEN** no `ConceptProposal` is produced for that action

---

### Requirement: Ingest pipeline emits and persists concept proposals
After `conceptResolutionService.resolve()` returns, `IngestPipelineService` SHALL call `lifecycleService.conceptProposals(job, proposals)`, which broadcasts one `PROGRESS` SSE event per proposal (step `concept-proposal`) and persists the full proposals list to the `concept_proposals` column of the `jobs` table.

#### Scenario: Proposals emitted live during execution
- **WHEN** concept resolution completes during an active job
- **THEN** one SSE event with `step = "concept-proposal"`, `message = proposedTitle`, and `result = JSON(ConceptProposal)` is broadcast per proposal

#### Scenario: Proposals persisted to DB
- **WHEN** concept resolution completes
- **THEN** the job row's `concept_proposals` column is updated with the full list as a JSON array before the pipeline continues

#### Scenario: No concept actions in plan
- **WHEN** the mutation plan contains no concept `create` actions
- **THEN** no `concept-proposal` SSE events are emitted and `concept_proposals` is set to `[]`

---

### Requirement: Jobs API returns concept proposals
The `JobSummary` DTO and job detail API response SHALL include a `conceptProposals` field containing the persisted list for that job.

#### Scenario: Completed job returned from history API
- **WHEN** a client fetches `/api/jobs`
- **THEN** each job entry includes a `conceptProposals` array (empty array if none)

#### Scenario: Single job fetch
- **WHEN** a client fetches `/api/jobs/{id}`
- **THEN** the response includes `conceptProposals` for that job

---

### Requirement: Jobs screen displays concept proposals
`JobsViewerComponent` SHALL display a concept proposals section for each job that has proposals, both during execution (live via SSE) and after completion (from persisted data).

#### Scenario: Live concept proposals during job execution
- **WHEN** a `concept-proposal` SSE event arrives for an active job
- **THEN** the corresponding job card in the jobs screen immediately shows the new proposal

#### Scenario: Persistent trace after job completion
- **WHEN** the jobs screen loads and a completed job has concept proposals
- **THEN** the job card displays all proposals from `JobState.conceptProposals`

#### Scenario: Deduplication indicated in UI
- **WHEN** a proposal has `deduplicated = true`
- **THEN** the UI clearly distinguishes it from a new concept (e.g., label "merged → <resolvedPath>" vs. "new")

#### Scenario: Job with no concept proposals
- **WHEN** a job has an empty `conceptProposals` array
- **THEN** no concept proposals section is shown in that job card

---

### Requirement: Frontend JobState accumulates concept proposals from SSE and API
`JobsStore` SHALL accumulate `concept-proposal` step events into `JobState.conceptProposals[]` and SHALL populate this array from API responses in `mergeHistory()`.

#### Scenario: SSE accumulation
- **WHEN** a `concept-proposal` SSE event arrives
- **THEN** the parsed `ConceptProposal` is appended to `JobState.conceptProposals` for the matching job

#### Scenario: History load
- **WHEN** `mergeHistory()` is called with a job that has concept proposals
- **THEN** `JobState.conceptProposals` is populated from the API response
