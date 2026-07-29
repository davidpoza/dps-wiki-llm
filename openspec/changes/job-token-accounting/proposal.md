## Why

Every job that runs the LLM (ingest, enrich, merge, keyword regeneration, answer, health‑check, etc.) consumes tokens against the OpenAI‑compatible endpoint, but that cost is invisible today — the `usage` block returned by `/chat/completions` is discarded. Operators have no way to see how expensive a given job was, spot runaway prompts, or reason about total spend. Surfacing per‑job token counts on the `/jobs` screen makes LLM cost observable where jobs already live.

## What Changes

- Capture the `usage` object (`prompt_tokens`, `completion_tokens`, `total_tokens`) from every `/chat/completions` response instead of discarding it.
- Attribute each chat completion's token usage to the job currently executing, accumulating across all LLM calls a job makes (including retried attempts that return a usage block).
- Persist per‑job token totals (`prompt_tokens`, `completion_tokens`, `total_tokens`) on the `jobs` table.
- Expose the totals through the `/jobs` list API (`JobSummary`) and the single‑job endpoint.
- Display tokens spent for each job on the `/jobs` screen (a compact chip on the job card), with the total shown once the job reaches a terminal state.
- Out of scope: embedding token counting. The embeddings sidecar uses TEI's native `/embed` endpoint, which returns no `usage`, so embedding tokens cannot be measured and are excluded.

## Capabilities

### New Capabilities
- `job-token-accounting`: Capturing LLM chat‑completion token usage, attributing it to the executing job, persisting per‑job totals, exposing them via the jobs API, and rendering them on the `/jobs` screen.

### Modified Capabilities
<!-- No existing spec's requirements change; token display is additive to the jobs history view. -->

## Impact

- **Backend**
  - `OpenAiCompatibleLlmClient.doChat` — read `usage` from the response and report it.
  - New per‑job accounting mechanism (thread‑scoped accumulator) established by `JobConsumers` around each job's execution; jobs run synchronously on the RabbitMQ listener thread, so a thread‑local context cleanly captures all LLM calls the job makes.
  - `Job` entity + `jobs` table — new nullable `prompt_tokens`, `completion_tokens`, `total_tokens` columns (new Flyway migration).
  - `JobSummary` DTO and `JobController` (`/jobs`, `/jobs/{id}`) — expose token totals.
- **Frontend (Angular)**
  - `api.service.ts` `JobSummary`, `types.ts` `JobState`, `jobs.store.ts` (`mergeHistory`, `refetchJob`) — carry token fields.
  - `jobs-viewer.component.ts` — render a tokens chip on each job card; new `jobs.tokens` transloco key.
- **No breaking changes**: new fields are additive and null for historical jobs.
