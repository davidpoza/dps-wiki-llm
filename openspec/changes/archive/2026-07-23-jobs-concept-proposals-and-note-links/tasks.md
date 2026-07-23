## 1. Database Migration

- [x] 1.1 Create `V10__job_concept_proposals.sql` adding `concept_proposals jsonb DEFAULT '[]'` column to the `jobs` table

## 2. Backend — Domain & DTOs

- [x] 2.1 Create `ConceptProposal` record in `com.dpswikillm.dto` with fields: `String proposedPath`, `String proposedTitle`, `boolean deduplicated`, `String resolvedPath`
- [x] 2.2 Create `ConceptResolutionResult` record in `com.dpswikillm.dto` with fields: `MutationPlan plan`, `List<ConceptProposal> proposals`
- [x] 2.3 Add `conceptProposals` field (`List<ConceptProposal>`) to `Job` entity as a `jsonb` column with `@JdbcTypeCode(SqlTypes.JSON)`
- [x] 2.4 Add `conceptProposals` field (`List<ConceptProposal>`) to `JobSummary` DTO record

## 3. Backend — ConceptResolutionService

- [x] 3.1 Change `resolve(MutationPlan plan)` return type to `ConceptResolutionResult`
- [x] 3.2 In `resolveAction()`, build and return a `ConceptProposal` for each concept `create` action (both deduped and new)
- [x] 3.3 Collect all proposals and return them alongside the resolved plan in a `ConceptResolutionResult`

## 4. Backend — JobLifecycleService

- [x] 4.1 Add `conceptProposals(Job job, List<ConceptProposal> proposals)` method that: persists the proposals list to `job.conceptProposals`, saves the job, and broadcasts one `PROGRESS` SSE event per proposal (step `"concept-proposal"`, message = `proposedTitle`, result = JSON of the `ConceptProposal`)

## 5. Backend — IngestPipelineService & API

- [x] 5.1 Update `IngestPipelineService` to use the new `ConceptResolutionResult` return type and call `lifecycleService.conceptProposals(job, result.proposals())` after concept resolution
- [x] 5.2 Update `JobController` to include `conceptProposals` in the job history and single-job responses (mapping from `Job.conceptProposals`)

## 6. Frontend — Types & Store

- [x] 6.1 Add `ConceptProposal` interface to `types.ts`: `{ proposedPath: string; proposedTitle: string; deduplicated: boolean; resolvedPath?: string | null }`
- [x] 6.2 Add `conceptProposals: ConceptProposal[]` field to `JobState` interface in `types.ts`
- [x] 6.3 In `JobsStore.handleEvent()`, handle `event.step === 'concept-proposal'` by parsing `event.result` as `ConceptProposal` and appending to `existing.conceptProposals`
- [x] 6.4 In `JobsStore.mergeHistory()`, populate `conceptProposals` from the API job summary when building the initial `JobState`

## 7. Frontend — JobsViewerComponent

- [x] 7.1 Inject `Router` into `JobsViewerComponent` and add `openFile(path: string)` method using `this.router.navigate(['explorer', ...path.split('/')])`
- [x] 7.2 Make `job.files` entries clickable: replace `<span class="file-path">{{ f.path }}</span>` with a `<button>` that calls `openFile(f.path)`, styled consistently with `GitHistoryComponent`'s `.editor-btn` pattern
- [x] 7.3 Make `job.currentActivity.path` clickable: wrap it in a button that calls `openFile(job.currentActivity.path)`
- [x] 7.4 Add concept proposals section to the job card template: shown only when `job.conceptProposals?.length > 0`, displaying each proposal's title, path, and a deduplication indicator ("merged → resolvedPath" for deduped, "new" for new)
- [x] 7.5 Add CSS styles for the concept proposals section and clickable path buttons

## 8. Frontend — GitHistoryComponent

- [x] 8.1 Make the `<span class="file-path">` text in `GitHistoryComponent` clickable by adding `(click)="openFile(entry.path)"` and `cursor: pointer` CSS to the `.file-path` class
