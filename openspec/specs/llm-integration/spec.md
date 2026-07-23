# llm-integration Specification

## Purpose
TBD - created by archiving change spring-angular-migration. Update Purpose after archive.
## Requirements
### Requirement: OpenAI-compatible chat completions via Spring AI

The system SHALL perform chat completions through Spring AI configured against an OpenAI-compatible endpoint, with a provider-switchable base URL, model, and API key supplied by configuration.

#### Scenario: Chat completion returns synthesized text

- **WHEN** a service requests a chat completion with a system+user message set
- **THEN** Spring AI calls the configured endpoint and returns the assistant response text

#### Scenario: Provider switch without code change

- **WHEN** the configured base URL and model point to a different OpenAI-compatible provider
- **THEN** completions use the new provider on restart with no source changes

### Requirement: Embeddings via Spring AI

The system SHALL produce text embeddings through a Spring AI OpenAI-compatible embedding client pointed at the local embeddings sidecar, returning one fixed-dimension vector per input, using the same model at index time and query time.

#### Scenario: Embed a batch of texts

- **WHEN** a caller submits N texts to embed
- **THEN** the sidecar returns N vectors of the model's configured dimension

#### Scenario: Sidecar unavailable surfaces an error

- **WHEN** the embeddings sidecar is unreachable
- **THEN** the embedding call fails with a clear error rather than returning empty or partial vectors

### Requirement: Retry and error handling

The system SHALL retry retryable LLM failures (HTTP 429 and 5xx, and network errors) with bounded exponential backoff, and SHALL surface non-retryable client errors (other 4xx) immediately without retry.

#### Scenario: Transient error is retried

- **WHEN** an LLM call returns HTTP 429 or a 5xx status
- **THEN** the call is retried up to the configured maximum attempts with backoff before failing

#### Scenario: Client error fails fast

- **WHEN** an LLM call returns a non-retryable 4xx status
- **THEN** the error is raised immediately without retry

### Requirement: Structured JSON extraction

The system SHALL provide a helper that extracts a JSON object from an LLM response and validates its shape before the result is used to mutate the vault.

#### Scenario: Invalid JSON is rejected

- **WHEN** an LLM response expected to contain JSON cannot be parsed or fails shape validation
- **THEN** the caller receives an error and no vault mutation is attempted from that response

