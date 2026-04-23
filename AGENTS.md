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
│   ├── projects/    ← user-managed only, excluded from all automation
│   └── indexes/
├── outputs/
├── state/
│   ├── kb.db                ← SQLite FTS index
│   └── semantic/            ← vector index (gitignored, local only)
│       ├── manifest.json
│       └── notes/
└── INDEX.md
```

### Processing Layers

```text
[INPUT]
raw/ -> event layer

[PROCESSING]
n8n + LLM + Node scripts

[STATE]
wiki/ -> durable knowledge graph in markdown form

[INDEX — lexical]
SQLite FTS5 in state/kb.db
  reindex.ts   → build
  search.ts    → query (BM25)

[INDEX — semantic]
ONNX vector index in state/semantic/  (gitignored, local only)
  embed-index.ts     → build / incremental update
  semantic-search.ts → query (cosine similarity)

[QUERY — hybrid]
hybrid-search.ts
  → FTS leg + semantic leg in parallel
  → min-max normalise each leg
  → finalScore = 0.6 × semantic + 0.4 × lexical
  → answer-run.ts / ingest-run.ts
```

---

## Runtime Model

This system is designed to run with:

- self-hosted `n8n` as the orchestrator
- Node.js scripts for deterministic local operations
- SQLite FTS5 for lexical retrieval
- a local ONNX vector index for semantic retrieval (built by `embed-index.ts`, never committed to git)
- a vault mounted locally, even if the canonical storage is WebDAV-backed

The intended execution model is:

```text
n8n trigger/workflow
-> Node.js script
-> local vault mutation or index query
-> structured result back to n8n
```

Do not treat `n8n` as the place where all business logic should live.
Use `n8n` for orchestration and scheduling, and keep fragile or stateful operations inside explicit scripts.

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

- file-system events on `raw/**`

Pipeline:

```text
raw event
-> ingest-source.ts
-> idempotency / duplicate check
-> LLM ingestion prompt   (may produce concept/entity/analysis updates; may update existing topics; NEVER creates new topic files)
-> structured JSON plan
-> guardrail-plan.ts      (validate path constraints, idempotency keys)
-> resolve-terms.ts       (term resolution: match concepts against existing topics via embedding;
                           convert matched terms to topic updates; dedup concept creates vs disk)
[transaction checkpoint: git HEAD + idempotency-keys snapshot]
-> apply-update.ts
-> reindex.ts
-> commit.ts
[on any failure: git reset --hard <pre-run-sha> → restore idempotency-keys → reindex]
```

**Topic creation rule:** Topics are created exclusively by the user under `wiki/topics/`.
No pipeline step may produce a `create` action for a topic path — `apply-update.ts` enforces this with a hard guard that throws on any such attempt.
Automation MAY update existing topic files (add Related links, add grounded context sections) but NEVER creates new ones.
A concept term is redirected to a topic `update` when cosine similarity ≥ `TOPIC_MATCH_THRESHOLD` (default 0.72).
The auto-created note types are `wiki/sources/` (by the baseline pipeline) and `wiki/concepts/`, `wiki/entities/`, `wiki/analyses/` (by the LLM planner).

### 2. Answer Flow

```text
user query  [+ optional retrieval_mode: fts | semantic | hybrid]
-> hybrid-search.ts (default when semantic index exists)
   or search.ts (fallback / explicit fts mode)
   or semantic-search.ts (explicit semantic mode)
-> top-k candidate documents
-> answer-context.ts  (markdown read + context packet)
-> LLM answer synthesis
-> answer-record.ts   (output artifact)
-> feedback-record.ts (validate proposal, no wiki mutation)
-> response
```

The answer step should not update the wiki directly.
First produce the answer, then run feedback evaluation.

`retrieval_mode` defaults to `"hybrid"` in `answer-run.ts`.
If the semantic index (`state/semantic/manifest.json`) does not exist, the mode
falls back to `"fts"` automatically — no error, no configuration change required.

### 3. Feedback Loop

```text
significant answer or output
-> extract candidate claims / corrections / links / open questions
-> compare against current wiki state
-> classify each candidate
-> persistence decision
-> if approved: apply-update.ts
-> reindex.ts
-> commit.ts
```

Core rule:

```text
feedback evaluation is mandatory
wiki propagation is conditional
```

This keeps the system powerful without making it noisy.
Every meaningful output should be reviewed for reusable knowledge, but most outputs should not blindly mutate the wiki.

Persistence decisions:

- `none` = nothing worth keeping
- `output_only` = keep the output artifact, do not update the wiki
- `propagate` = update the wiki with grounded, targeted changes

### 4. Maintenance Flow

Triggers:

- weekly cron
- monthly cron
- manual repair runs

Pipeline:

```text
scheduled or manual maintenance
-> lint.ts or health-check.ts
-> structured findings
-> optional apply-update.ts
-> reindex.ts
-> commit.ts
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
- any `create` action targeting `wiki/topics/` is rejected at every layer: LLM prompt rules, `guardrail-plan.ts`, `resolve-terms.ts`, and the hard guard in `apply-update.ts`

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
- preserve the `n8n -> script -> vault/index` execution model
- favor small, explicit changes over sweeping rewrites
- use the templates above when creating new notes
- keep source traceability intact
- treat `wiki/` as curated state, not a chat log
- avoid inventing structure that cannot be maintained
- prefer granular notes over large category monoliths
- keep facts, interpretation, and open questions clearly separated

When uncertain:

- do not write speculative knowledge into durable state
- prefer adding an open question over forcing a conclusion
- prefer a new source note over an overconfident synthesis

For JSON contracts, script contracts, indexing model, environment variables, and operational details, see [`docs/architecture.md`](docs/architecture.md).
