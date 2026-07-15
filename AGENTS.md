# AGENTS.md

## Overview

This repository implements a persistent knowledge system built around a simple rule:

- `raw/` stores incoming events
- `wiki/` stores the curated, derived knowledge state
- `state/` stores indexes and metadata
- `outputs/` stores ephemeral or exportable artifacts

This is not a classic RAG chatbot with memory.
This is a deterministic knowledge-maintenance pipeline that converts inputs into structured, reusable notes.

The design is strongly inspired by Andrej Karpathy's "LLM OS" style framing and system-building notes:
`https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f`

Use that reference as architectural inspiration, not as a literal implementation contract.

---

## System Intent

The system should:

- turn raw inputs into durable knowledge
- keep derived knowledge separate from event ingestion
- maintain a searchable markdown-based wiki
- support deterministic indexing and retrieval
- prefer reusable notes over one-off responses

The system should not:

- behave like a free-form autonomous agent
- mutate the knowledge base without clear rules
- mix ingestion triggers with derived state updates
- treat the wiki as a dump of LLM outputs

---

## Core Architecture

### Storage Layers

```text
vault/
├── raw/
│   ├── inbox/
│   ├── bookmarks/
│   ├── voice/
│   └── web/
├── wiki/
│   ├── concepts/
│   ├── entities/
│   ├── topics/
│   ├── sources/
│   ├── analyses/
│   ├── projects/    ← user-managed only; ingestion automation must not mutate it
│   └── indexes/
├── outputs/
├── state/
│   ├── runtime/
│   │   └── idempotency-keys.json
│   └── change-log/
└── INDEX.md
```

### Processing Layers

```text
[INPUT]
raw/ -> event layer

[PROCESSING]
Spring Boot backend + RabbitMQ job queues + LLM API (OpenAI-compatible)

[STATE]
wiki/ -> durable knowledge graph in markdown form

[INDEX — lexical]
PostgreSQL pg_trgm / ILIKE over documents table (path/title/body)
  FileLookupService → manual file lookup and review support

[INDEX — semantic]
pgvector HNSW index in document_embeddings table
  EmbeddingIndexService  → build / incremental update
  SemanticSearchService  → query (cosine similarity)

[QUERY — semantic]
SemanticSearchService
  → embed query via TEI sidecar (multilingual-e5-small)
  → top-k cosine distance over HNSW index
  → AnswerPipelineService / ConnectionDiscoveryService
```

---

## Runtime Model

This system is designed to run with:

- Spring Boot 3.3 (Java 21) backend as the orchestrator
- Angular 21 frontend, built and served by nginx in the `frontend` container
- JWT authentication with optional TOTP 2FA
- RabbitMQ job queues: `wiki-write-jobs` and `answer-jobs`
- PostgreSQL 17 + pgvector for semantic retrieval and document indexing
- TEI sidecar serving `multilingual-e5-small` (384 dims) for embeddings
- `web-extractor` microservice (Node + Playwright, embedded Chromium): renders URLs in a real browser and returns structured markdown + metadata for `POST /extract`. `RawIntakeService.ingestUrl` calls it and writes YAML frontmatter to `raw/web/**`
- Telegram long-polling bot for remote interaction (optional)
- A vault directory mounted into the backend container

The intended execution model is:

```text
REST API or Telegram bot
-> enqueue job (RabbitMQ)
-> Spring service (IngestPipelineService / AnswerPipelineService)
-> vault mutation or semantic query
-> SSE progress events → frontend / Telegram reply
```

Keep business logic inside Spring services, not in controllers. Controllers are thin routing layers.
The backend servlet context path is `/api`; controllers declare paths relative to that context.

---

## Non-Negotiable Boundary

Keep a hard separation between:

```text
raw/  = reactive event stream
wiki/ = stable derived state
```

Critical rule:

```text
ONLY trigger on raw/**
NEVER trigger on wiki/**
```

If this rule is violated, the likely outcomes are:

- infinite processing loops
- accidental self-triggering workflows
- corrupted or noisy state
- non-deterministic behavior

---

## System Flows

### 1. Ingestion Flow

Trigger:

- REST upload or URL submission through `JobController`
- Telegram `/ingest <url>` through `WikiBotService`
- manual enqueue with a payload reference under `raw/**`

Pipeline:

```text
raw payload reference
-> RawIntakeService (for URL/upload) writes raw/inbox/** or raw/web/**
-> JobQueueService enqueues INGEST on wiki-write-jobs
-> IngestPipelineService
   -> transaction checkpoint: git HEAD + state/runtime/idempotency-keys.json snapshot
   -> SourceNormalizer
   -> SourceNoteLlmService
   -> SourceNotePlanner baseline MutationPlan for wiki/sources/**
   -> MutationApplier
   -> RootIndexService updates INDEX.md
   -> ReindexService replaces PostgreSQL documents rows from wiki/**
   -> EmbeddingIndexService incrementally refreshes pgvector embeddings
   -> LlmMutationPlanService requests optional concept/entity/analysis/topic updates
   -> MutationGuardrailService validates path constraints, topic rules, idempotency, and source backlinks
   -> ConnectionDiscoveryService persists LLM and semantic connection candidates
   -> GuidedReviewService applies accepted candidates immediately in unattended mode, or later in validated mode
   -> GitService commits the operation
[on any failure: git reset --hard <pre-run-sha> → restore idempotency ledger]
```

**Topic creation rule:** Topics are created exclusively by the user under `wiki/topics/`.
No pipeline step may produce a `create` action for a topic path — `MutationGuardrailService` rejects it and `MutationApplier` also enforces a hard guard that throws on any such attempt.
Automation MAY update existing topic files (add Related links, add grounded context sections) but NEVER creates new ones.
The auto-created note types are `wiki/sources/` (by the baseline pipeline) and `wiki/concepts/`, `wiki/entities/`, `wiki/analyses/` (by the LLM planner after guardrails).

### 2. Answer Flow

```text
user query
-> JobQueueService enqueues ANSWER on answer-jobs
-> AnswerPipelineService
-> SemanticSearchService
-> OpenAiCompatibleEmbeddingClient embeds the query via TEI sidecar
-> JdbcDocumentIndexRepository queries pgvector HNSW over document_embeddings
-> top-k candidate documents with bounded context packet
-> LLM answer synthesis
-> write outputs/answer-<jobId>.md
-> response
```

The answer step should not update the wiki directly.
The current implementation uses semantic retrieval only for answers. Lexical lookup exists separately through `FileLookupService` and `/api/files/lookup` for file search and manual review workflows.

### 3. Feedback Loop

```text
significant answer or output
-> extract candidate claims / corrections / links / open questions
-> compare against current wiki state
-> classify each candidate
-> persistence decision
-> if approved: MutationApplier
-> ReindexService
-> EmbeddingIndexService
-> GitService commit
```

Core rule:

```text
feedback evaluation should be deliberate
wiki propagation is conditional
```

This keeps the system powerful without making it noisy.
Meaningful outputs should be reviewed for reusable knowledge, but outputs should not blindly mutate the wiki.

Persistence decisions:

- `none` = nothing worth keeping
- `output_only` = keep the output artifact, do not update the wiki
- `propagate` = update the wiki with grounded, targeted changes

### 4. Maintenance Flow

Maintenance is an intended workflow, not a fully implemented scheduled subsystem in the current Spring app.

Expected triggers:

- weekly cron
- monthly cron
- manual repair runs

Expected pipeline:

```text
scheduled or manual maintenance
-> structural/traceability checks over wiki/**
-> structured findings
-> optional MutationApplier
-> ReindexService
-> EmbeddingIndexService
-> GitService commit
```

Maintenance checks:

- duplicate notes
- oversized pages
- broken links
- inconsistent frontmatter
- unsupported claims
- orphan pages
- concept gaps
- contradiction review
- concept-topic candidates (concepts with many links → suggestion to convert to topic manually)

---

## Knowledge Model

### Node Types

#### `concept`

- smallest reusable knowledge unit
- high granularity
- reusable across topics

#### `entity`

- person, company, product, organization, place, or named actor

#### `topic`

- aggregation page
- organizes related notes
- should not become the primary location of raw facts
- **created exclusively by the user** — no automation may ever create new topic files under `wiki/topics/`
- automation may and should update existing topic files: adding Related links, adding grounded context, pruning weak links
- any `create` action targeting `wiki/topics/` is rejected by LLM prompt rules, `MutationGuardrailService`, and the hard guard in `MutationApplier`

#### `source`

- normalized representation of an original input
- ideally maps 1:1 to a raw artifact or event

#### `analysis`

- derived synthesis worth preserving
- only create when it has ongoing reuse value

### Authoring Principles

- one note should represent one main idea
- atomic beats comprehensive when the note is likely to be reused
- topics aggregate; concepts explain; sources ground claims
- avoid storing the same fact in many places
- link aggressively, duplicate reluctantly

---

## Page Standards

Each durable wiki page should aim to include the following sections when relevant:

```md
# Title

## Summary

## Facts
- Verifiable assertions only

## Interpretation
- Context, explanation, implications

## Related
- [[Linked notes]]

## Sources
- Explicit references

## Open Questions
- Optional
```

### Content Constraints

- preferred size: under 250 to 300 lines
- split pages that contain multiple large concepts
- avoid flat, contextless bullet dumps
- avoid decorative prose
- every important claim should be traceable

---

## Templates

Use these as defaults when generating or updating notes.

### Concept Template

```md
---
type: concept
title: <Concept name>
status: stable
tags:
  - concept
updated: <YYYY-MM-DD>
---

# <Concept name>

## Summary
One paragraph defining the concept and why it matters in this system.

## Facts
- Fact 1
- Fact 2

## Interpretation
Explain the mechanism, significance, or tradeoffs.

## Related
- [[Related Note]]

## Sources
- [[Source: <name>]]

## Open Questions
- Question if unresolved
```

### Entity Template

```md
---
type: entity
title: <Entity name>
entity_type: <person|company|product|org|place|other>
status: stable
updated: <YYYY-MM-DD>
---

# <Entity name>

## Summary
Short identity statement.

## Facts
- What it is
- Why it matters here

## Relationships
- Related to [[Concept]]
- Mentioned in [[Topic]]

## Sources
- [[Source: <name>]]
```

### Topic Template

```md
---
type: topic
title: <Topic name>
status: evolving
updated: <YYYY-MM-DD>
---

# <Topic name>

## Summary
What this topic groups together.

## Key Concepts
- [[Concept A]]
- [[Concept B]]

## Key Entities
- [[Entity A]]

## Current State
Concise synthesis of the topic as it stands now.

## Gaps
- Missing concept
- Missing source

## Sources
- [[Source: <name>]]
```

### Source Template

```md
---
type: source
title: <Source title>
source_kind: <web|voice|bookmark|note|other>
source_ref: <path-or-id>
captured_at: <ISO timestamp>
updated: <YYYY-MM-DD>
---

# <Source title>

## Summary
What this source contains.

## Raw Context
Short normalized description of the original material.

## Extracted Claims
- Claim 1
- Claim 2

## Linked Notes
- [[Concept]]
- [[Entity]]
```

### Analysis Template

```md
---
type: analysis
title: <Analysis title>
status: draft
updated: <YYYY-MM-DD>
---

# <Analysis title>

## Question
What is being analyzed.

## Evidence
- Evidence point with source

## Synthesis
Short derived conclusion.

## Confidence
high | medium | low

## Sources
- [[Source: <name>]]
```

---

## Mutation Rules

### Safe Edits

Allowed:

- add facts with sources
- improve wording without changing meaning
- add links
- fix structure
- split oversized notes

Avoid:

- full rewrites without reason
- deleting content without reviewing dependencies
- merging unrelated concepts into one page
- adding unsupported interpretation as fact

### When To Create A New Node

Create a new page when:

- a concept appears repeatedly
- an entity becomes recurring
- a note is overloaded
- a topic lacks a stable anchor page

### When To Split A Page

Split when:

- the page exceeds roughly 300 lines
- the note covers several independent concepts
- navigation becomes difficult
- sections would be more reusable as standalone notes

---

## Design Principles

- determinism over magic
- clarity over completeness
- reusable notes over long monoliths
- controlled automation over opaque autonomy
- stable state over global reactivity
- explicit provenance over plausible synthesis

---

## Working Heuristics

- if a note keeps growing, split it
- if a fact repeats, abstract it
- if a claim lacks grounding, do not persist it
- if a page becomes hard to scan, restructure it
- if an update would create loops, stop and redesign the trigger

---

## Definition Of Success

The system is succeeding when:

- answers improve as the wiki improves
- notes become easier to navigate over time
- concepts remain reusable across many queries
- ingestion adds structure instead of noise
- indexing stays reliable and predictable

The system is failing when:

- the wiki grows without stronger structure
- duplicates multiply
- source traceability degrades
- topic pages become dumping grounds
- automation produces non-deterministic edits

---

## Agent Guidance

When operating on this repository, agents should:

- preserve the `raw/` versus `wiki/` separation
- preserve the `REST/Telegram → RabbitMQ → Spring service → vault/pgvector` execution model
- favor small, explicit changes over sweeping rewrites
- use the templates above when creating new notes
- keep source traceability intact
- do not create or update `wiki/projects/**` from ingestion or connection automation
- treat `wiki/` as curated state, not a chat log
- avoid inventing structure that cannot be maintained
- prefer granular notes over large category monoliths
- keep facts, interpretation, and open questions clearly separated

When uncertain:

- do not write speculative knowledge into durable state
- prefer adding an open question over forcing a conclusion
- prefer a new source note over an overconfident synthesis

For setup, service ports, environment variables, and API paths, see [`README.md`](README.md).
For historical notes and lower-level architecture details, see [`docs/architecture.md`](docs/architecture.md), but verify it against the Spring implementation before treating it as authoritative.
