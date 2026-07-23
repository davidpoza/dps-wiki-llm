## ADDED Requirements

### Requirement: Retrieve context for a question

The system SHALL answer a question by running semantic retrieval (top-k nearest neighbors over the pgvector index), reading the retrieved `wiki/**` documents, and building a bounded context packet.

#### Scenario: Semantic retrieval builds the context packet

- **WHEN** an answer job runs for a question
- **THEN** the system embeds the question, retrieves the top-k nearest-neighbor documents, reads their markdown bodies, and produces a bounded context packet with the evidence document paths

#### Scenario: Empty index yields no evidence

- **WHEN** the semantic index has no rows
- **THEN** the answer job produces a context packet with no evidence documents rather than failing

### Requirement: LLM answer synthesis and record

The system SHALL synthesize an answer from the context packet using the configured LLM, write the answer artifact under `outputs/`, and emit a canonical answer record referencing the evidence used. The answer step SHALL NOT mutate `wiki/**`.

#### Scenario: Answer artifact is written without wiki mutation

- **WHEN** the LLM produces an answer from the context packet
- **THEN** the system writes the answer artifact under `outputs/`, returns the answer record with evidence references, and makes no change to `wiki/**`

#### Scenario: Cleanup on failure

- **WHEN** a step after writing the answer artifact fails
- **THEN** the written artifact is removed before the error is surfaced

### Requirement: Feedback evaluation stub

The system SHALL mark each answer record with a feedback-review flag but SHALL NOT propagate feedback into the wiki in this change; feedback propagation is deferred to a later change.

#### Scenario: Answer flagged for later feedback review

- **WHEN** an answer record is produced
- **THEN** it carries a `should_review_for_feedback` flag and no wiki propagation is attempted

### Requirement: Answer progress over SSE

The system SHALL emit job progress events for the answer pipeline (retrieval, context build, synthesis, record) over the SSE channel.

#### Scenario: Progress events reported during answer

- **WHEN** an answer job advances through its steps
- **THEN** subscribers receive `PROGRESS` events and a terminal `COMPLETED` or `FAILED` event
