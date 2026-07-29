## ADDED Requirements

### Requirement: Capture chat-completion token usage

The system SHALL read the `usage` object (`prompt_tokens`, `completion_tokens`, `total_tokens`) from each `/chat/completions` response and report those counts to the active job accounting context. When a response omits the `usage` object, the system SHALL treat the counts as zero and MUST NOT fail the LLM call.

#### Scenario: Response includes usage

- **WHEN** a chat completion returns `usage` with `prompt_tokens=100`, `completion_tokens=40`, `total_tokens=140`
- **THEN** 100 prompt tokens, 40 completion tokens, and 140 total tokens are added to the active job's running totals

#### Scenario: Response omits usage

- **WHEN** a chat completion response contains no `usage` object
- **THEN** the call returns its content normally and adds zero tokens to the job's totals

### Requirement: Attribute token usage to the executing job

The system SHALL attribute every chat-completion's token usage to the job whose execution triggered the call, accumulating usage across all LLM calls made during that job. When multiple attempts of a single logical call each return a `usage` block (e.g. transport retries), each returned usage SHALL be counted. LLM calls made outside of a job's execution (e.g. interactive chat or link‑explain requests) SHALL NOT be attributed to any job.

#### Scenario: Job makes multiple LLM calls

- **WHEN** a job performs three chat completions consuming 140, 90, and 60 total tokens
- **THEN** the job's persisted total token count is 290

#### Scenario: Concurrent jobs are accounted independently

- **WHEN** two jobs execute on separate worker threads and each makes LLM calls
- **THEN** each job's token totals reflect only the calls made during its own execution, with no cross-contamination

#### Scenario: Non-job LLM call is not attributed

- **WHEN** an interactive chat request or a link-explain request invokes the LLM outside any job execution
- **THEN** no job's token totals are modified

### Requirement: Persist per-job token totals

The system SHALL persist `prompt_tokens`, `completion_tokens`, and `total_tokens` for each job on the `jobs` record when the job reaches a terminal state (completed, failed, or reverted). Jobs that existed before this capability, or jobs that made no LLM calls, SHALL report null or zero totals and MUST remain valid.

#### Scenario: Completed job persists totals

- **WHEN** a job that consumed 290 total tokens finishes
- **THEN** its `jobs` row stores `total_tokens = 290` along with the corresponding prompt and completion breakdown

#### Scenario: Historical job without token data

- **WHEN** a job created before this capability is listed
- **THEN** it is returned without error and its token totals are absent (null) or zero

### Requirement: Expose token totals via the jobs API

The system SHALL include the per-job token totals in the `/jobs` list response and the single-job (`/jobs/{id}`) response.

#### Scenario: Jobs list includes token totals

- **WHEN** a client requests `GET /jobs`
- **THEN** each job entry includes `promptTokens`, `completionTokens`, and `totalTokens`

### Requirement: Display tokens spent on the /jobs screen

The `/jobs` screen SHALL display the tokens spent for each job that consumed tokens. The total token count SHALL be shown on the job card once the job reaches a terminal state. A job with no recorded token usage SHALL NOT display a token indicator.

#### Scenario: Terminal job shows token count

- **WHEN** a completed job with `totalTokens = 290` is rendered on the `/jobs` screen
- **THEN** its card shows a tokens indicator reading `290` tokens

#### Scenario: Job without tokens shows no indicator

- **WHEN** a job with no recorded token usage (null or zero) is rendered
- **THEN** no token indicator is shown on its card
