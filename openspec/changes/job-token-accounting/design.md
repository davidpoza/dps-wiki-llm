## Context

Jobs are dispatched over RabbitMQ and executed **synchronously on the listener thread** (`JobConsumers.consumeWriteJob` / `consumeAnswerJob`). During a job, pipeline services (ingest, enrich, merge, keyword regeneration, answer, health‑check…) call the LLM through the `LlmClient` interface, whose only implementation is `OpenAiCompatibleLlmClient`. That client posts to `/chat/completions` and today extracts only `choices[0].message.content`, discarding the `usage` block the OpenAI‑compatible API returns.

The `LlmClient` is a shared singleton with no notion of "which job am I serving". The calling pipelines do not thread a job id through their method signatures. So the central design question is how to attribute a completion's tokens to the right job without invasively rewiring every service that touches the LLM.

Constraints:
- The embeddings sidecar uses TEI's native `/embed` endpoint, which returns no `usage` — embedding tokens are unmeasurable and therefore out of scope.
- Jobs run one‑per‑thread and synchronously, so a call made during a job stays on the job's thread.
- Retries: `RetryingLlmExecutor` re‑runs the whole supplier; a retried transport call may itself return a usage block.

## Goals / Non-Goals

**Goals:**
- Capture `usage` from every chat completion and attribute it to the executing job.
- Persist per‑job `prompt_tokens` / `completion_tokens` / `total_tokens` and expose them via the jobs API.
- Show the total tokens spent on each job card on the `/jobs` screen.
- Zero changes to the many pipeline service call sites.

**Non-Goals:**
- Embedding token counting (no `usage` available from `/embed`).
- Cost/currency conversion or pricing (only raw token counts).
- Per‑call or per‑phase token breakdown in the UI (only the job total, plus prompt/completion split stored for future use).
- Live token streaming during a running job (totals are shown at terminal state).

## Decisions

### Decision 1: Thread-scoped accumulator over threading a jobId through call sites

Introduce a `JobTokenAccounting` component backed by a `ThreadLocal<Accumulator>`. `JobConsumers` opens a context before running a job and closes it after (try/finally), reading out the totals to persist. `OpenAiCompatibleLlmClient.doChat` calls `accounting.record(prompt, completion, total)` after a successful response; when no context is active (non‑job calls), `record` is a no‑op.

- **Why:** Jobs are single‑threaded and synchronous, so a thread‑local naturally scopes to exactly the LLM calls a job makes. It avoids editing ~10 pipeline services and their method signatures.
- **Alternative — pass `jobId` explicitly:** rejected; invasive, touches every LLM‑using service and its callers, easy to miss a path.
- **Alternative — persist a `token_usage` row per LLM call keyed by jobId:** more granular but requires the same job‑id propagation problem plus a new table; deferred as a possible future enhancement. The accumulator can later feed such a table without changing call sites.
- **Trade‑off:** if a pipeline ever offloads an LLM call to a *different* thread (e.g. `CompletableFuture`/parallel stream), the thread‑local won't propagate and those tokens go uncounted. Current job pipelines are synchronous; the async `link-discovery-stream` path is not a job and is intentionally excluded. This is documented as a known limitation (see Risks).

### Decision 2: Store totals on the `jobs` table, not a separate table

Add nullable `prompt_tokens`, `completion_tokens`, `total_tokens` (BIGINT) columns to `jobs` via a new Flyway migration (`V40__job_token_usage.sql`), with matching fields + accumulate helper on the `Job` entity.

- **Why:** The data is 1:1 with a job and always read alongside the job in the `/jobs` list — a denormalized column is the simplest correct model and needs no join.
- **Nullable, default null:** historical jobs and jobs that made no LLM calls stay valid; the UI treats null/0 as "no indicator".

### Decision 3: Persist at terminal transition; expose via existing endpoints

`JobConsumers` writes the accumulated totals onto the `Job` and saves when the job reaches a terminal state (in the finally block, covering completed/failed). `JobSummary` gains `promptTokens`/`completionTokens`/`totalTokens`, populated in `JobController.listJobs`; `/jobs/{id}` already returns the entity.

- **Why:** Reuses the existing read path (`JobsStore.mergeHistory` + the terminal `refetchJob`) so the frontend picks up totals with a minimal change. No new endpoint or SSE field required.
- **Alternative — push totals in the terminal SSE `JobEvent`:** avoids the refetch but widens the event contract; rejected in favor of the already‑present terminal refetch.

### Decision 4: UI shows total only, at terminal state

`jobs-viewer.component.ts` renders a compact tokens chip in the job header/footer when `totalTokens` is present and > 0, using a new `jobs.tokens` transloco key. The number is formatted with the existing locale number formatting.

- **Why:** Matches the request ("mostrar los tokens gastados para cada job") without cluttering the card; prompt/completion split is stored for later but not shown initially.

## Risks / Trade-offs

- **Off‑thread LLM calls escape accounting** → Mitigation: job pipelines are synchronous today; add a note so future async work either propagates the context or accepts the gap. Non‑job async paths (link‑discovery stream) are excluded by design.
- **Retries double‑count when a failed attempt still returned usage** → Accepted: those tokens were genuinely billed by the provider, so counting each returned usage reflects real spend. Attempts that throw before a usage block simply contribute nothing.
- **Provider omits `usage`** → Mitigation: treat as zero, never fail the call; totals may under‑report for such providers.
- **Concurrent jobs** → Handled: each RabbitMQ listener thread has its own thread‑local, so totals never cross between jobs.
- **Large token counts** → `BIGINT`/`long` avoids overflow for realistically long jobs.

## Migration Plan

1. Apply Flyway `V40__job_token_usage.sql` adding the three nullable columns (forward‑only; existing rows get null).
2. Deploy backend (entity, accounting component, client capture, DTO/controller changes) and frontend together.
3. Rollback: the columns are additive and nullable; reverting the app leaves harmless unused columns. No data migration to undo.

## Open Questions

- Should the card also surface the prompt/completion split (e.g. on hover)? Stored now, deferred for UI until requested.
- Is an aggregate "total tokens across all jobs" figure desired on the `/jobs` header? Out of scope for this change.
