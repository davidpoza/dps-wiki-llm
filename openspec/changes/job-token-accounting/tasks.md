## 1. Persistence (schema + entity)

- [x] 1.1 Add Flyway migration `V40__job_token_usage.sql` adding nullable `prompt_tokens`, `completion_tokens`, `total_tokens` (BIGINT) columns to `jobs`
- [x] 1.2 Add `promptTokens`, `completionTokens`, `totalTokens` (Long) fields to `Job` entity with getters/setters
- [x] 1.3 Add an `addTokenUsage(long prompt, long completion, long total)` accumulate helper on `Job` (null-safe, starts from 0)

## 2. Token accounting mechanism

- [x] 2.1 Create `JobTokenAccounting` component backed by a `ThreadLocal` accumulator (prompt/completion/total counters)
- [x] 2.2 Expose `open()`/`close()` (or try-with-resources context) to start/clear a per-job context, and `record(prompt, completion, total)` that is a no-op when no context is active
- [x] 2.3 Expose a `snapshot()`/getter returning the accumulated totals for the active context

## 3. Capture usage in the LLM client

- [x] 3.1 In `OpenAiCompatibleLlmClient.doChat`, read the `usage` object (`prompt_tokens`, `completion_tokens`, `total_tokens`) from the response
- [x] 3.2 Call `JobTokenAccounting.record(...)` with the parsed counts after a successful completion; treat a missing/partial `usage` as zeros and never fail the call
- [x] 3.3 Inject `JobTokenAccounting` into the client constructor

## 4. Wire accounting into job execution

- [x] 4.1 In `JobConsumers.consumeWriteJob`, open a token-accounting context before dispatching the pipeline and close it in a finally block
- [x] 4.2 In `JobConsumers.consumeAnswerJob`, do the same around the answer pipeline
- [x] 4.3 On completion of the job (finally / terminal path), read the accumulated totals, set them on the `Job`, and persist via `JobRepository`
- [x] 4.4 Ensure totals are saved for terminal states including FAILED (partial usage before failure is still recorded)

## 5. Expose via API

- [x] 5.1 Add `promptTokens`, `completionTokens`, `totalTokens` to the `JobSummary` record
- [x] 5.2 Populate the new fields in `JobController.listJobs` from the `Job` entity
- [x] 5.3 Confirm `/jobs/{id}` returns the entity with the new fields (no change expected)

## 6. Frontend model + store

- [x] 6.1 Add `promptTokens?`, `completionTokens?`, `totalTokens?` to the `JobSummary` interface in `api.service.ts`
- [x] 6.2 Add the same optional token fields to `JobState` in `types.ts`
- [x] 6.3 Map token fields in `JobsStore.mergeHistory` when seeding jobs from history
- [x] 6.4 Map token fields in `JobsStore.refetchJob` so a job that just reached a terminal state picks up its totals

## 7. Frontend display

- [x] 7.1 Add a `jobs.tokens` transloco key (e.g. Spanish + any other supported locales)
- [x] 7.2 In `jobs-viewer.component.ts`, render a compact tokens chip on the job card when `totalTokens` is present and > 0, formatted with locale number formatting
- [x] 7.3 Ensure the chip is hidden for jobs with null/zero tokens

## 8. Verification

- [x] 8.1 Backend: unit test that `OpenAiCompatibleLlmClient` records usage into an active accounting context and no-ops without one
- [x] 8.2 Backend: verify a completed job persists correct accumulated totals across multiple LLM calls; concurrent jobs stay independent
- [ ] 8.3 Compile backend (`mvn compile`) and restart the local backend process (port 8090, local profile — no DevTools)
- [ ] 8.4 Frontend: run a job end-to-end and confirm the tokens chip appears on the `/jobs` card once the job completes; a no-LLM job shows no chip
