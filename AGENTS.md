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
-> LLM ingestion prompt
-> structured JSON plan
[transaction checkpoint: git HEAD + idempotency-keys snapshot]
-> apply-update.ts
-> reindex.ts
-> commit.ts
[on any failure: git reset --hard <pre-run-sha> → restore idempotency-keys → reindex]
```

Expected plan shape:

- `summary`
- `source_refs`
- `page_actions`
- `index_updates`

The canonical JSON shape is defined in `JSON Interface Contracts`.
The source note should normally be represented as a `create` action under `wiki/sources/`.

Ingestion must be idempotent.
If the same raw event is seen multiple times because of sync noise, retries, or WebDAV behavior, the system should detect that and avoid duplicating knowledge.

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

## Indexing Model

### Lexical Index (SQLite FTS5)

```text
docs (
  id,
  path,
  title,
  doc_type,
  updated_at,
  body
)

docs_fts (FTS5)
```

Pipeline:

```text
wiki/**/*.md
-> parse frontmatter
-> extract body
-> upsert docs
-> rebuild docs_fts      (reindex.ts)
```

Query (BM25, scores are negative log-probability sums):

```sql
SELECT path, title, bm25(docs_fts) AS score
FROM docs_fts
JOIN docs ON docs.id = docs_fts.rowid
WHERE docs_fts MATCH query
ORDER BY score
LIMIT k;
```

### Semantic Index (Local Vector Index)

Location: `state/semantic/` (gitignored, never committed)

```text
state/semantic/
├── manifest.json           ← registry: {version, model, dimension, mode, items}
└── notes/
    └── wiki__foo.md_note.json   ← EmbeddingUnit per indexed note
```

Pipeline:

```text
wiki/**/*.md
-> normalizeTextForEmbedding()   strip frontmatter, wikilinks, markdown syntax
-> hashText()                    16-hex SHA-256 fingerprint
-> compare with manifest hash    skip unchanged documents
-> @xenova/transformers          CPU inference, INT8 quantised model
-> mean-pool output tensor       [1, seq_len, dim] -> [dim]
-> saveEmbeddingUnit()           write notes/<id>.json
-> saveManifest()                update manifest.json   (embed-index.ts)
```

Query (cosine similarity, scores in [-1, 1]):

```text
query string
-> normalizeTextForEmbedding()   same normalization as at index time
-> @xenova/transformers          embed query
-> cosineSimilarity(query, unit) per indexed unit
-> sort descending
-> top k                         (semantic-search.ts)
```

### Hybrid Query Pattern

```text
query
-> search (BM25)         top 3k results
-> semantic-search       top 3k results
-> minMaxNormalise([BM25 scores]) -> [0, 1]
-> minMaxNormalise([cosine scores]) -> [0, 1]
-> finalScore = 0.6 × semantic + 0.4 × lexical  (per candidate)
-> union of both result sets, ranked by finalScore
-> top k                 (hybrid-search.ts)
```

---

## Script Contracts

### `init-db.ts`

- creates base tables
- initializes FTS

### `ingest-source.ts`

- normalizes incoming raw input
- converts heterogeneous inputs into a stable internal shape
- extracts basic metadata needed by the ingestion prompt
- prepares source material before any LLM planning step
- should be the only script that turns a raw event into a normalized ingestion payload

### `plan-source-note.ts`

- consumes a normalized source payload
- creates a safe baseline mutation plan for the source note and root index
- emits the matching commit input for the baseline ingestion run
- may be replaced by a richer LLM planner when ingestion should update concepts, entities, topics, or analyses

### `reindex.ts`

- walks `wiki/`
- parses markdown and frontmatter
- updates SQLite rows
- rebuilds the FTS index
- ROLLBACK failures are logged at `error` level and include the error message; they are not silently swallowed

### `search.ts`

- input: query string
- output: top-k documents as JSON (BM25 scores, negative)
- should search `wiki/`-derived state first, not `raw/`

### `embed-index.ts`

- input: CLI flags (`--vault`, `--rebuild`)
- output: JSON summary (`embedded`, `skipped`, `removed`, `total`); writes `state/semantic/` on disk
- incremental by default: only re-embeds documents whose normalised-text hash has changed
- must be run after `reindex` whenever wiki content changes significantly
- `state/semantic/` is gitignored and local-only; it must be (re)built on each deployment

### `semantic-search.ts`

- input: positional query string, `--vault`, `--limit`
- output: `SearchResult` JSON (same contract as `search.ts`, scores in [-1, 1])
- requires the semantic index to exist; returns an empty result list if it does not
- the query must be embedded with the same model used at index time

### `hybrid-search.ts`

- input: positional query string, `--vault`, `--limit`
- output: `SearchResult` JSON with an extra `mode` field (`"hybrid"` or `"fts"`)
- falls back to pure FTS when the semantic index is absent — no configuration change required
- the `mode` field lets callers distinguish which path was taken for logging/debugging

### `answer-context.ts`

- consumes a question plus search result payload
- reads retrieved `wiki/**` markdown files
- emits bounded markdown context and an answer record shell for the answer workflow
- should not mutate the wiki

### `answer-record.ts`

- consumes generated answer text plus an answer record shell
- writes the answer artifact under `outputs/`
- emits the canonical answer record for feedback evaluation
- should not mutate the wiki
- `answer-run.ts` tracks the written artifact path; if any subsequent step fails, the artifact is deleted before re-throwing (transactional cleanup)

### `apply-update.ts`

- input: structured JSON mutation plan
- allowed actions:
  - create file
  - update file
  - update index pages
- avoid broad rewrites
- preserve note identity when possible

### `lint.ts`

- performs structural linting of the markdown knowledge base
- detects maintainability issues such as oversize pages, inconsistent naming, incomplete frontmatter, orphan pages, and stale indexes
- should output structured findings, not free-form prose
- should focus on structure and maintainability, not semantic truth

### `health-check.ts`

- performs a deeper semantic and traceability review of the knowledge base
- detects contradictions, unsupported claims, concept gaps, stale low-confidence notes, and other long-term quality issues
- should output structured findings with severity and recommended actions
- should be suitable for scheduled monthly review runs

### `feedback-record.ts`

- produces the canonical machine-readable feedback record for significant answers and analyses
- may emit a derived mutation plan when the decision is `propagate`
- should also generate a compact human-readable review summary
- must separate feedback evaluation from actual wiki mutation

### `commit.ts`

- stages intended changes
- writes consistent git commit messages
- records a structured change log entry
- updates lightweight note metadata when needed
- must not duplicate raw git diffs inside markdown notes

### Minimum Script Set

The minimum serious script set is:

- `init-db.ts`
- `ingest-source.ts`
- `reindex.ts`
- `search.ts`
- `apply-update.ts`
- `lint.ts`
- `health-check.ts`
- `feedback-record.ts`
- `commit.ts`

These scripts should:

- accept arguments or JSON input in a deterministic way
- emit machine-readable JSON on success
- use exit codes correctly
- remain callable from `n8n` via local command execution

---

## JSON Interface Contracts

Keep the number of contracts small.
For robustness, reuse the same JSON shapes across ingestion, feedback, and maintenance.

Design rule:

- keep `action` values coarse
- keep `change_type` values expressive
- keep source support explicit

This is simpler and more robust than inventing many micro-actions.

### 1. Normalized Source Payload

Produced by `ingest-source.ts`.
Consumed by the ingestion prompt and downstream planners.

```json
{
  "source_id": "src-2026-04-10-web-abc123",
  "source_kind": "web",
  "captured_at": "2026-04-10T20:15:00Z",
  "raw_path": "raw/web/2026-04-10-abc123.md",
  "title": "Example source title",
  "content": "Normalized source content",
  "canonical_url": "https://example.com/article",
  "author": "Example Author",
  "language": "en",
  "checksum": "sha256:...",
  "metadata": {
    "tags": [
      "llm",
      "wiki"
    ]
  }
}
```

### 2. Mutation Plan

This is the canonical write contract.
`apply-update.ts` should consume this shape for ingestion, feedback propagation, lint autofixes, and health-check fixes.

```json
{
  "plan_id": "plan-2026-04-10T20-15-00Z-ingest-abc123",
  "operation": "ingest",
  "summary": "Create source note and update related concept pages",
  "source_refs": [
    "raw/web/2026-04-10-abc123.md",
    "wiki/sources/2026-04-10-example-source.md"
  ],
  "page_actions": [
    {
      "path": "wiki/sources/2026-04-10-example-source.md",
      "action": "create",
      "doc_type": "source",
      "change_type": "net_new_fact",
      "idempotency_key": "src-2026-04-10-web-abc123",
      "payload": {
        "title": "Example source title",
        "frontmatter": {
          "type": "source",
          "source_kind": "web",
          "updated": "2026-04-10"
        },
        "sections": {
          "Summary": [
            "Short normalized summary."
          ],
          "Extracted Claims": [
            "Claim 1",
            "Claim 2"
          ],
          "Linked Notes": [
            "[[Example Concept]]"
          ]
        },
        "change_reason": "Initial source ingestion"
      }
    },
    {
      "path": "wiki/concepts/example-concept.md",
      "action": "update",
      "doc_type": "concept",
      "change_type": "correction",
      "idempotency_key": "src-2026-04-10-web-abc123:wiki/concepts/example-concept.md",
      "payload": {
        "sections": {
          "Facts": [
            "Add grounded fact from the new source."
          ],
          "Sources": [
            "[[2026-04-10-example-source]]"
          ]
        },
        "related_links": [
          "[[Example Topic]]"
        ],
        "change_reason": "Grounded update from source ingestion"
      }
    }
  ],
  "index_updates": [
    {
      "path": "INDEX.md",
      "action": "update",
      "change_type": "index_update",
      "entries_to_add": [
        "[[2026-04-10-example-source]]"
      ]
    }
  ],
  "post_actions": {
    "reindex": true,
    "commit": true
  }
}
```

Mutation plan rules:

- prefer `create`, `update`, or `noop` only
- do not encode dozens of low-level edit verbs
- use `change_type` to express meaning
- include `idempotency_key` for every write action
- include `source_refs` for every grounded mutation

### 3. Mutation Result

Produced by `apply-update.ts`.
Used by `n8n`, `reindex.ts`, and `commit.ts`.

```json
{
  "plan_id": "plan-2026-04-10T20-15-00Z-ingest-abc123",
  "status": "applied",
  "created": [
    "wiki/sources/2026-04-10-example-source.md"
  ],
  "updated": [
    "wiki/concepts/example-concept.md",
    "INDEX.md"
  ],
  "skipped": [],
  "idempotent_hits": [
    "src-2026-04-10-web-abc123"
  ]
}
```

### 4. Search Result

Produced by `search.ts`, `semantic-search.ts`, and `hybrid-search.ts`.
All three tools emit the same `SearchResult` shape so callers treat them uniformly.
`hybrid-search.ts` adds an extra `mode` field.

```json
{
  "query": "model context protocol for agents",
  "limit": 8,
  "results": [
    {
      "path": "wiki/concepts/model-context-protocol.md",
      "title": "Model Context Protocol",
      "doc_type": "concept",
      "score": 0.87
    }
  ]
}
```

Score interpretation by tool:
- `search.ts` — BM25 score (negative; more negative = less relevant; ordered ascending by SQLite)
- `semantic-search.ts` — cosine similarity in [-1, 1]; higher = more relevant
- `hybrid-search.ts` — fused normalised score in [0, 1]; higher = more relevant

### 5. Answer Record

Produced by the answer workflow before feedback evaluation.
This separates response generation from knowledge propagation.

```json
{
  "output_id": "out-2026-04-10-answer-001",
  "question": "When should I use a persistent wiki instead of simple RAG?",
  "output_path": "outputs/2026-04-10-persistent-wiki-vs-rag.md",
  "evidence_used": [
    "wiki/concepts/rag.md",
    "wiki/topics/llm-wiki.md"
  ],
  "should_review_for_feedback": true
}
```

### 6. Feedback Record

This is the canonical contract for the feedback loop.
It should be produced for every significant answer or analysis, even when no wiki change is applied.

```json
{
  "output_id": "out-2026-04-10-answer-001",
  "decision": "propagate",
  "reason": "The answer introduced one grounded correction and one reusable open question",
  "source_refs": [
    "wiki/sources/2026-04-10-example-source.md"
  ],
  "candidate_items": [
    {
      "item_id": "item-001",
      "target_note": "wiki/concepts/persistent-wiki.md",
      "change_type": "correction",
      "novelty": "correction",
      "source_support": [
        "src-2026-04-10-web-abc123"
      ],
      "proposed_content": "Clarify that feedback evaluation is mandatory but propagation is conditional.",
      "outcome": "applied"
    },
    {
      "item_id": "item-002",
      "target_note": "wiki/topics/knowledge-systems.md",
      "change_type": "open_question",
      "novelty": "net_new",
      "source_support": [
        "src-2026-04-10-web-abc123"
      ],
      "proposed_content": "When should a reusable answer remain output-only instead of being propagated?",
      "outcome": "deferred"
    }
  ],
  "affected_notes": [
    "wiki/concepts/persistent-wiki.md"
  ],
  "mutation_plan_ref": "state/feedback/2026-04-10-answer-001-mutation-plan.json"
}
```

Feedback record rules:

- every candidate item must include `change_type`, `novelty`, `source_support`, and `outcome`
- valid `decision` values are `none`, `output_only`, or `propagate`
- valid `outcome` values are `applied`, `rejected`, or `deferred`
- if `decision` is `propagate`, the record should point to a mutation plan
- if `decision` is `none` or `output_only`, `mutation_plan_ref` may be omitted

### 7. Maintenance Result

Produced by `lint.ts` and `health-check.ts`.
Consumed by humans first, and by `apply-update.ts` only when autofix is explicitly approved.

```json
{
  "run_id": "lint-2026-04-10",
  "kind": "lint",
  "findings": [
    {
      "severity": "warning",
      "path": "wiki/topics/ai-agents.md",
      "issue_type": "oversized_page",
      "description": "The page has become too broad and exceeds the preferred size.",
      "recommended_action": "Split into smaller concept or topic pages.",
      "auto_fixable": false
    }
  ]
}
```

### 8. Commit Result

Produced by `commit.ts`.
Used by `n8n` for logging and traceability.

```json
{
  "operation": "feedback",
  "commit_created": true,
  "commit_sha": "abc1234",
  "change_log_path": "state/change-log/2026-04-10T20-15-00Z-feedback.md"
}
```

### Contract Mapping

- `ingest-source.ts` -> normalized source payload
- `plan-source-note.ts` or ingestion prompt -> mutation plan
- `apply-update.ts` -> mutation plan in, mutation result out
- `search.ts` -> search result (BM25)
- `embed-index.ts` -> writes `state/semantic/` (no stdout contract beyond status JSON)
- `semantic-search.ts` -> search result (cosine similarity)
- `hybrid-search.ts` -> search result (fused score) + `mode` field
- `answer-context.ts` -> answer context packet
- `answer-record.ts` or answer workflow -> answer record
- feedback evaluation -> feedback record and optional mutation plan
- `lint.ts` / `health-check.ts` -> maintenance result
- `commit.ts` -> commit result

---

## Change Log Policy

The system needs change traceability, but logs should not pollute the semantic wiki.

Use three layers:

### 1. Git History

- authoritative history of file diffs
- rollback and audit layer
- not a substitute for semantic change summaries

### 2. Structured System Logs

- store detailed operational change records in `state/` or `wiki/indexes/change-log/`
- prefer `state/` for low-level operational logs
- prefer `wiki/` only for logs with ongoing retrieval value

Recommended shape:

```md
---
type: change_log
timestamp: <ISO timestamp>
operation: <ingest|merge|lint|health-check|manual>
sources:
  - raw/...
affected_notes:
  - wiki/concepts/...
change_kind:
  - create
  - update
summary: <short summary>
commit: <git sha>
---
```

### 3. Minimal Note Metadata

- keep only small traceability fields inside notes
- do not append rolling narrative logs inside every page

Acceptable examples:

- `updated`
- `updated_by`
- `source_refs`
- `change_reason`

Do not create long `Change Log` sections inside concept, entity, topic, or source pages unless the history itself is part of the knowledge.

---

## Feedback Record Policy

Change logs answer:

- what changed operationally

Feedback records answer:

- why a generated output did or did not change the knowledge base

These are different concerns and should not be collapsed into a single free-form note.

### Mandatory Rule

Every significant answer, briefing, or analysis must end with a recorded feedback decision, even if the decision is `none`.

This is how the feedback loop becomes auditable and complete without forcing noisy wiki edits.

### Canonical Feedback Record

The canonical feedback record should be structured and machine-readable.
It may live in `state/feedback/`, `outputs/`, or a similar operational location.

Use the `Feedback Record` JSON contract defined above.

### Human-Readable Summary

A short markdown table is useful for human review, but it should be a summary layer, not the canonical contract.

Preferred table:

```md
| Target Note | Change Type | Source Support | Outcome |
|-------------|-------------|----------------|---------|
| wiki/concepts/... | net_new_fact | src-... | applied |
| wiki/topics/... | open_question | src-... | deferred |
| wiki/entities/... | better_wording | src-... | rejected |
```

This is stronger than a table like:

```md
| Wiki Article | What Was Added/Corrected | New Insight? |
```

because `New Insight?` is too coarse.
The system needs to distinguish at least:

- `net_new_fact`
- `correction`
- `better_wording`
- `new_link`
- `open_question`
- `split_suggestion`

and it should record whether each item was applied, rejected, or deferred.

### Output Propagation Rules

- never copy an entire answer back into the wiki
- propagate note-sized changes, not essay-sized blobs
- every propagated item must have explicit source support
- if a useful answer yields no safe wiki change, record `output_only` and stop

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

## Persistence Policy

Classify candidate knowledge using both novelty and actionability.

Candidate novelty:

```text
already_present
better_wording
net_new
correction
speculative
unsupported
```

Candidate change type:

```text
fact
new_link
open_question
split_suggestion
```

Persist only:

- `net_new` with grounding
- `correction` with grounding
- `better_wording` when it improves clarity without losing meaning
- `open_question` when it captures a recurring unresolved gap

Do not persist:

- decorative summaries
- unsupported conclusions
- low-value repetition
- temporary conversational context
- raw operational logs inside semantic pages

Default persistence order:

1. decide `none`, `output_only`, or `propagate`
2. if `propagate`, update the smallest relevant note set
3. reindex
4. commit with a feedback record

---

## Safety And Operations

### Deployment Context

- self-hosted `n8n`
- VM environment
- VPN-restricted access
- single-user oriented
- vault mounted through WebDAV or equivalent

### Real Risk Surface

The main risk is not public exposure.
The main risk is:

```text
filesystem + triggers + automation
```

### Required Mitigations

- trigger only on `raw/`
- never trigger automatically on `wiki/`
- ignore `.obsidian/`
- ignore `state/`
- ignore `outputs/`
- ignore `*.db`
- ignore `.git/`
- never execute commands from note content
- separate detection from processing
- keep mutation scripts deterministic
- keep local file watchers scoped to the minimum path necessary

### Trigger Policy

If the vault is mounted locally from WebDAV or similar storage:

- react to changes in `raw/` only
- treat `wiki/` as derived state, not as an event source
- reindex `wiki/` after controlled updates, not because `wiki/` itself changed

This is critical because reacting to `wiki/` mutations creates feedback loops.

---

## Pipeline Reliability

### LLM Retry

`lib/llm.ts` wraps every `chatCompletion` call with exponential-backoff retry (up to 3 attempts, base delay 15 s).
Only retryable status codes (429, 5xx) and network errors trigger a retry.
Client errors (4xx except 429) are thrown immediately.

### Transactional Rollback — `lib/pipeline-tx.ts`

`PipelineTx` implements a saga-style compensating transaction:

```text
tx = new PipelineTx()
tx.onRollback("name", async () => { /* compensating action */ })
// ... mutation steps ...
// on failure:
await tx.rollback(log)  // executes handlers in registration order; each is isolated
```

Handlers execute in registration order (not reverse).
A failure in one handler is logged at `error` level and does not prevent remaining handlers from running.
If no handlers were registered (failure before any mutation), `rollback()` is a no-op.

`lib/git.ts` provides `getGitHead(cwd)` (returns null when git is unavailable) and `gitResetHard(cwd, sha)` for use inside compensating actions.

### `EMBED_MODEL` Environment Override

`resolvedEmbedModel()` in `config.ts` reads the `EMBED_MODEL` environment variable and falls back to `SYSTEM_CONFIG.semantic.model`. All tools that load the vector index (`embed-index.ts`, `semantic-search.ts`, `hybrid-search.ts`, `lib/semantic-index.ts`, `lib/local-transformers-provider.ts`) call this function instead of accessing the config value directly, so the model can be changed per-deployment without a code rebuild.

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
