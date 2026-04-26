# Architecture Reference

This document is the technical reference for the `dps-wiki-llm` toolchain. It covers JSON contracts, script contracts, the indexing model, environment variables, module details, and operational details.

For system intent, knowledge model, and design principles, see [`AGENTS.md`](../AGENTS.md).
For Docker Compose setup, LLM configuration, and n8n workflow operation, see [`production-runbook.md`](production-runbook.md).

---

## Entry Points

| File | Purpose | Main Input | Main Output |
|------|---------|------------|-------------|
| `tools/init-db.ts` | Creates the SQLite database file and ensures the base schema exists. | CLI flags such as `--vault` and optional `--db`. | JSON with `db_path` and `initialized`. |
| `tools/ingest-source.ts` | Normalizes a `raw/**` artifact into the canonical source payload. | Raw event JSON via `--input` or `stdin`. | Normalized Source Payload JSON. |
| `tools/youtube-transcript.ts` | Calls `yt-dlp` to fetch YouTube subtitles and writes them as a raw web artifact. | JSON with `url` and optional `captured_at` via `--input` or `stdin`. | JSON with created `raw_path` or a handled failure reason. |
| `tools/ingest-run.ts` | Runs the compact production ingest pipeline from one n8n command node. | Raw event JSON or Telegram `/ingest` payload via `--input` or `stdin`. | JSON containing baseline ingest results, optional LLM plan results, Telegram message payloads, and handled YouTube failures. |
| `tools/answer-run.ts` | Runs the compact production answer pipeline from one n8n command node. | Question or Telegram update payload via `--input` or `stdin`. | JSON containing the generated answer, answer record, validated feedback proposal, retrieval context, and Telegram message payload. |
| `tools/render-n8n-workflows.ts` | Legacy helper for rendering workflows that still contain n8n LLM HTTP nodes. | Optional workflow paths plus `LLM_API_KEY_HEADER`. | JSON render summary and updated workflow files when matching nodes are present. |
| `tools/plan-source-note.ts` | Builds the deterministic baseline ingestion plan for creating a source note. | Normalized Source Payload JSON via `--input` or `stdin`. | JSON containing `mutation_plan` and `commit_input`. |
| `tools/reindex.ts` | Scans wiki markdown files and rebuilds the relational and FTS indexes. | CLI flags such as `--vault` and optional `--db`. | JSON with indexed document count and rebuilt status. |
| `tools/search.ts` | Runs a full-text search query against `state/kb.db`. | Positional search query plus CLI flags. | JSON search result payload with ranked documents. |
| `tools/embed-index.ts` | Builds or incrementally updates the local semantic (vector) index. | CLI flags `--vault` and optional `--rebuild`. | JSON summary; writes `state/semantic/` on disk. |
| `tools/semantic-search.ts` | Embeds a query and retrieves the top-K semantically similar wiki documents. | Positional query plus CLI flags. | JSON SearchResult compatible with `search.ts` output. |
| `tools/hybrid-search.ts` | Combines FTS (BM25) and semantic results via weighted score fusion. | Positional query plus CLI flags. | JSON SearchResult with `mode: "hybrid"` (or `"fts"` on fallback). |
| `tools/answer-context.ts` | Reads retrieved wiki documents and builds the answer context packet. | Search Result JSON plus question via `--input` or `stdin`. | Answer Context Packet JSON. |
| `tools/answer-record.ts` | Writes a generated answer artifact and emits the canonical answer record. | Answer text plus Answer Record JSON via `--input` or `stdin`. | JSON with record, output path, and write status. |
| `tools/apply-update.ts` | Applies a canonical mutation plan to markdown files and index pages. | Mutation Plan JSON via `--input` or `stdin`. | Mutation Result JSON. |
| `tools/feedback-record.ts` | Normalizes a feedback decision, writes audit artifacts, and optionally derives a mutation plan. | Feedback Record JSON via `--input` or `stdin`. | JSON with normalized record and generated artifact paths. |
| `tools/lint.ts` | Checks the wiki for structural and maintainability issues. | CLI flags such as `--vault` and optional `--write`. | Maintenance Result JSON for lint findings. |
| `tools/health-check.ts` | Performs deeper semantic and traceability validation over the wiki. | CLI flags such as `--vault` and optional `--write`. | Maintenance Result JSON for health findings. |
| `tools/commit.ts` | Stages related files, writes a change log, and creates a Git commit. | Commit input JSON via `--input` or `stdin`. | Commit Result JSON. |

---

## Shared Libraries

| File | Responsibility |
|------|----------------|
| `tools/config.ts` | Central behavior configuration for paths, thresholds, valid enum values, SQLite setup, and report locations. |
| `tools/lib/contracts.ts` | TypeScript interfaces for JSON contracts. Covers mutation plans, feedback records, search results, maintenance results, and commit results. |
| `tools/lib/cli.ts` | Common CLI parsing and JSON input/output helpers. |
| `tools/lib/db.ts` | SQLite connection setup, schema creation, and FTS rebuild helpers. Wraps `node:sqlite` with repository-specific pragmas. |
| `tools/lib/fs-utils.ts` | Safe path resolution and filesystem helpers scoped to a vault root. Enforces the "do not write outside the vault" boundary. |
| `tools/lib/frontmatter.ts` | Minimal YAML-like parser, serializer, and merge logic for note frontmatter. |
| `tools/lib/llm.ts` | Runtime LLM chat-completion helper with exponential-backoff retry (3×, 429/5xx). |
| `tools/lib/markdown.ts` | Markdown section parsing and idempotent note rendering. Merges content by section. |
| `tools/lib/run-tool.ts` | Helper for macro scripts to call sibling compiled tool scripts with JSON passed through temporary files. |
| `tools/lib/text.ts` | Shared hashing, slugging, truncation, and summary helpers. |
| `tools/lib/type-guards.ts` | Shared `isRecord()` and `stringValue()` type guards. |
| `tools/lib/maintenance.ts` | Shared `buildFinding()`, `severityRank()`, and `nowStamp()` used by `lint.ts` and `health-check.ts`. |
| `tools/lib/wiki-inspect.ts` | Wiki loading, metadata extraction, link parsing, and graph analysis. |
| `tools/lib/embedding-provider.ts` | `EmbeddingProvider` interface — single abstraction for all text-embedding backends. |
| `tools/lib/local-transformers-provider.ts` | CPU-local embedding via `@xenova/transformers` (ONNX Runtime). Downloads model on first use; fully offline after. |
| `tools/lib/semantic-index.ts` | Core data layer for the semantic index: manifest CRUD, text normalization, cosine similarity, and per-document embedding I/O. |
| `tools/lib/pipeline-tx.ts` | `PipelineTx` saga: register compensating actions, rollback on failure. |
| `tools/lib/git.ts` | `getGitHead`, `gitResetHard` — used by pipeline-tx compensating actions. |

---

## Execution Model

The scripts follow a deterministic local execution model:

1. A workflow or operator calls a package script with CLI flags and optional JSON input.
2. The script resolves every path inside a vault root.
3. Shared libraries handle markdown parsing, graph inspection, or SQLite updates.
4. The script returns machine-readable JSON for the caller.

This keeps orchestration logic outside the scripts while keeping fragile, stateful operations local and explicit.

---

## Module Details

### `tools/init-db.ts`

Resolves the vault root and the optional database path. Opens the SQLite database through `tools/lib/db.ts`. Ensures the base `docs` table and `docs_fts` virtual table exist. Returns the database path relative to the vault root.

### `tools/ingest-source.ts`

Accepts a raw event object containing `raw_path`, `path`, `filePath`, or `filename`. Rejects inputs outside `raw/**`. Reads the raw artifact, parses optional frontmatter, computes a SHA-256 checksum, and infers source kind from the raw folder. Emits the canonical Normalized Source Payload used by downstream planners.

### `tools/youtube-transcript.ts`

Accepts a YouTube video URL and optional language preferences. Loads YouTube subtitle metadata and subtitle files through `yt-dlp`, selecting a manual track when possible and falling back to autogenerated subtitles. Writes the transcript as a `raw/web/**` markdown artifact. Returns `status: "failed"` with a reason for handled cases.

### `tools/ingest-run.ts`

Accepts a raw event or Telegram `/ingest` payload. For YouTube ingest payloads, calls `youtube-transcript.ts` first. Calls `ingest-source.ts`, obtains an LLM-cleaned `source_note`, builds the baseline plan with `plan-source-note.ts`, applies it, reindexes, and commits. Requests a second LLM Mutation Plan for reusable wiki updates and validates it with guardrails. Emits Telegram message payloads for n8n to send.

### `tools/plan-source-note.ts`

Accepts a Normalized Source Payload, optionally enriched with `source_note`. Builds a Mutation Plan that creates a `wiki/sources/` note and updates `INDEX.md`. Includes idempotency keys, source references, and a matching Commit input payload.

### `tools/reindex.ts`

Loads every markdown document under `wiki/`. Clears the `docs` table inside a single write transaction. Inserts the latest document metadata and body text. Rebuilds the FTS table using SQLite's `rebuild` command. ROLLBACK failures are logged at `error` level instead of being silently swallowed.

### `tools/search.ts`

Accepts the query as the first positional argument. Normalizes natural-language queries into an FTS expression with stopword removal and a small bilingual synonym expansion. Queries `docs_fts` and joins back to `docs` for path, title, and type metadata. Returns ranked results using SQLite `bm25`. Searches only derived wiki state, never `raw/`.

### `tools/embed-index.ts`

Scans every `*.md` file under `wiki/` recursively. Normalises the text, computes a 16-hex SHA-256 fingerprint, and compares it against the stored hash in `state/semantic/manifest.json`. Files whose hash has not changed are skipped (incremental strategy). New and changed files are embedded and written under `state/semantic/notes/`. Manifest entries for deleted files are pruned. The `--rebuild` flag bypasses the hash check and re-embeds all documents unconditionally.

### `tools/semantic-search.ts`

Accepts the query as the first positional argument. Loads the full manifest and all embedding units into memory. Embeds the query using the same model used to build the index. Scores every indexed unit with cosine similarity and returns the top `--limit` results. Returns an empty result list (not an error) when the index has not been built.

### `tools/hybrid-search.ts`

Checks whether `state/semantic/manifest.json` exists; if not, falls back to pure FTS. When the index is available, spawns `search` and `semantic-search` in parallel, each fetching `limit × 3` candidates. Applies min-max normalisation independently to each result list, mapping both to `[0, 1]`. Computes a weighted linear combination: `finalScore = 0.6 × semanticNorm + 0.4 × lexicalNorm`. The `mode` field in the output is `"hybrid"` or `"fts"`.

### `tools/answer-context.ts`

Accepts a question and Search Result JSON. Reads the retrieved `wiki/**` markdown files from the vault. Strips frontmatter and includes bounded body text in `context_docs`. Creates the Answer Record shell for answer persistence and feedback evaluation.

### `tools/answer-record.ts`

Accepts an `answer_record` object plus the generated answer text. Writes the answer artifact under `outputs/`. Emits the canonical Answer Record JSON for downstream feedback review. The answer artifact does not mutate the semantic wiki.

### `tools/answer-run.ts`

Accepts a direct question or Telegram update payload. Reads the optional `retrieval_mode` field (`"fts"`, `"semantic"`, or `"hybrid"`; defaults to `"hybrid"`). Checks whether the semantic index exists; falls back to `"fts"` automatically if not. Calls `answer-context.ts`, LLM for answer synthesis, `answer-record.ts`, and `feedback-record.ts --no-write`. Returns an approval payload for `KB - Apply Feedback` when feedback decision is `propagate`. Tracks the written artifact path — if any subsequent step fails, the artifact is deleted before re-throwing.

### `tools/apply-update.ts`

Validates the Mutation Plan shape before writing. Maintains `state/runtime/idempotency-keys.json` to avoid duplicate application. Uses `renderMarkdown` to merge frontmatter and sections rather than replacing whole files. **Hard guard:** any `create` action whose path starts with `wiki/topics/` throws immediately. Topic files are created exclusively by the user. `update` actions on existing topic files are allowed.

### `tools/feedback-record.ts`

Validates feedback decisions and candidate items. Enforces that propagated items must include source support. Writes a canonical JSON feedback artifact and a compact markdown summary. Derives a Mutation Plan when the decision is `propagate`.

### `tools/lint.ts`

Loads every wiki document and analyzes the wiki link graph. Detects structural issues such as oversized notes, inconsistent names, missing frontmatter, and orphan pages. Can persist both a JSON report and a markdown summary under `state/maintenance/`. Focuses on maintainability and structure, not semantic truth.

### `tools/health-check.ts`

Reuses the wiki graph plus section metadata from `wiki-inspect.ts`. Checks for unsupported factual content, stale low-confidence notes, source-note traceability gaps, and missing-page references. Can persist both a JSON report and a markdown summary under `state/maintenance/`. With `--write`: auto-applies allowed mutations — discovers semantically similar notes and adds Related links to existing docs, prunes weak Related links below the cosine threshold, auto-generates `## Summary` sections for long concepts and sources, and repositions misplaced `## Summary` sections. **Never creates new topic files.** Excludes `wiki/projects/` from all checks.

### `tools/commit.ts`

Normalizes commit metadata from JSON input. Stages only the files relevant to the operation. Writes a structured markdown change log into `state/change-log/`. Requires Git identity before committing, from `git user.name`/`git user.email` or standard Git author/committer environment variables.

### `tools/config.ts`

Defines canonical vault-relative paths, behavior constants (valid mutation actions, ingest defaults, lint thresholds, health-check staleness thresholds, default search limit), SQLite schema strings and pragmas, and markdown section behavior. Change system behavior here first instead of duplicating constants inside individual scripts.

### `tools/lib/contracts.ts`

Encodes the JSON interface contracts as TypeScript interfaces. Provides shared types for `MutationPlan`, `MutationResult`, `FeedbackRecord`, `MaintenanceResult`, `CommitResult`, wiki docs, graph analysis, and CLI args.

### `tools/lib/cli.ts`

`parseArgs` provides a shared flag vocabulary. `readJsonInput` loads JSON from a file or from `stdin`. `writeJsonStdout` guarantees consistent machine-readable output formatting.

### `tools/lib/db.ts`

Lazily imports `node:sqlite` only when needed. Suppresses the experimental warning for the built-in SQLite module. Applies consistent pragmas for WAL mode, foreign keys, and temp storage. Exposes `ensureSchema` and `rebuildFts` as the minimal database contract used by the scripts.

### `tools/lib/fs-utils.ts`

Resolves the vault root and blocks path traversal outside it. Creates directories and parent directories on demand. Provides safe read/write helpers for text and JSON files. Converts filesystem paths to normalized POSIX-style vault paths for stored metadata. This module is the main safety boundary for local filesystem access.

### `tools/lib/frontmatter.ts`

Implements a small parser for the subset of YAML used in note frontmatter. Supports scalars, arrays, nested objects, and comment skipping. Serializes frontmatter back to a deterministic markdown-friendly format. Merges nested frontmatter objects and arrays without duplicating values. Intentionally narrow and dependency-free.

### `tools/lib/markdown.ts`

Parses a note body into title, preamble, and `##` sections. Detects whether a section should be rendered as bullets or paragraphs. Merges section content idempotently to avoid duplicate bullets or paragraphs. Rebuilds the final markdown document with merged frontmatter and content. This is the core note renderer used by `apply-update.ts`.

### `tools/lib/llm.ts`

Centralizes LLM-compatible chat completion calls. Reads `LLM_API_KEY` at runtime and supports `LLM_API_KEY_HEADER` for providers that require a custom API-key header. Uses `Authorization: Bearer <key>` when the header name is `Authorization`; otherwise it sends the raw key in the configured header. Provides JSON extraction and response metadata helpers.

### `tools/lib/run-tool.ts`

Lets macro scripts call sibling compiled scripts under `dist/tools/`. Writes JSON input to temporary files instead of sending large JSON through shell arguments. Keeps the n8n command surface small while preserving explicit script boundaries.

### `tools/lib/text.ts`

Provides stable hashes for IDs, filesystem-safe slugs with deterministic fallbacks, bounded text truncation, and first-paragraph extraction.

### `tools/lib/type-guards.ts`

Provides `isRecord()` (checks for plain JS object, not array) and `stringValue()` (returns trimmed string or undefined). Used across all CLI scripts to parse JSON input safely.

### `tools/lib/maintenance.ts`

Provides `buildFinding()`, `severityRank()`, and `nowStamp()` shared by `lint.ts` and `health-check.ts`. Imports `SYSTEM_CONFIG` and `MaintenanceFinding` types.

### `tools/lib/wiki-inspect.ts`

Walks `wiki/` recursively and loads every markdown file. Extracts frontmatter, title, updated date, section metadata, and wiki links. Builds alias maps so links can resolve by title, basename, or path stem. Produces graph structures for inbound links, broken links, and ambiguous targets.

### `tools/lib/embedding-provider.ts`

Defines the `EmbeddingProvider` interface with three members: `model` (string identifier), `dimension` (vector length), and `embed(texts)` (returns one vector per input). Purely a type/contract definition. Allows unit tests to inject a stub provider without loading ML models.

### `tools/lib/local-transformers-provider.ts`

Implements `EmbeddingProvider` using `@xenova/transformers` (ONNX Runtime, CPU only). Uses a dynamic `import()` so the WASM bootstrap only runs when the first `embed` call is made. Loads quantised (INT8) model weights, which are ~4× smaller and faster on CPU. Handles two output tensor shapes across `@xenova/transformers` API versions. Applies mean pooling over the sequence-length axis. The pipeline singleton is module-scoped, so multiple calls share one loaded ONNX session.

### `tools/lib/semantic-index.ts`

**Types:** `EmbeddingUnit` (persisted record for one note, including its vector and hash), `ManifestItem` (path + hash entry in the registry), `SemanticManifest` (top-level index file schema).

**Path helpers:** `semanticDirPath`, `manifestPath`, and `embeddingFilePath` (converts a note ID to a safe flat filename).

**I/O helpers:** `loadManifest` / `saveManifest`; `saveEmbeddingUnit` / `loadEmbeddingUnit` / `loadAllEmbeddingUnits`. All readers return `null` or a sentinel instead of throwing on missing files.

**Algorithms:** `normalizeTextForEmbedding` — strips YAML frontmatter, converts `[[wikilinks]]` to plain text, removes markdown syntax, strips heading markers, and collapses whitespace. `hashText` — first 16 hex characters of SHA-256 over the normalised text. `cosineSimilarity` — pure TypeScript dot-product-over-norms implementation.

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

## JSON Interface Contracts

Keep the number of contracts small. For robustness, reuse the same JSON shapes across ingestion, feedback, and maintenance.

Design rule:
- keep `action` values coarse
- keep `change_type` values expressive
- keep source support explicit

### 1. Normalized Source Payload

Produced by `ingest-source.ts`.

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
  "metadata": { "tags": ["llm", "wiki"] }
}
```

### 2. Mutation Plan

This is the canonical write contract. `apply-update.ts` consumes this shape for ingestion, feedback propagation, lint autofixes, and health-check fixes.

```json
{
  "plan_id": "plan-2026-04-10T20-15-00Z-ingest-abc123",
  "operation": "ingest",
  "summary": "Create source note and update related concept pages",
  "source_refs": ["raw/web/2026-04-10-abc123.md"],
  "page_actions": [
    {
      "path": "wiki/sources/2026-04-10-example-source.md",
      "action": "create",
      "doc_type": "source",
      "change_type": "net_new_fact",
      "idempotency_key": "src-2026-04-10-web-abc123",
      "payload": {
        "title": "Example source title",
        "frontmatter": { "type": "source", "source_kind": "web", "updated": "2026-04-10" },
        "sections": {
          "Summary": ["Short normalized summary."],
          "Extracted Claims": ["Claim 1", "Claim 2"],
          "Linked Notes": ["[[Example Concept]]"]
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
          "Facts": ["Add grounded fact from the new source."],
          "Sources": ["[[2026-04-10-example-source]]"]
        },
        "related_links": ["[[Example Topic]]"],
        "change_reason": "Grounded update from source ingestion"
      }
    }
  ],
  "index_updates": [
    {
      "path": "INDEX.md",
      "action": "update",
      "change_type": "index_update",
      "entries_to_add": ["[[2026-04-10-example-source]]"]
    }
  ],
  "post_actions": { "reindex": true, "commit": true }
}
```

Mutation plan rules:
- prefer `create`, `update`, or `noop` only
- use `change_type` to express meaning
- include `idempotency_key` for every write action
- include `source_refs` for every grounded mutation

### 3. Mutation Result

Produced by `apply-update.ts`.

```json
{
  "plan_id": "plan-2026-04-10T20-15-00Z-ingest-abc123",
  "status": "applied",
  "created": ["wiki/sources/2026-04-10-example-source.md"],
  "updated": ["wiki/concepts/example-concept.md", "INDEX.md"],
  "skipped": [],
  "idempotent_hits": ["src-2026-04-10-web-abc123"]
}
```

### 4. Search Result

Produced by `search.ts`, `semantic-search.ts`, and `hybrid-search.ts`.

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

Score interpretation:
- `search.ts` — BM25 score (negative; more negative = less relevant)
- `semantic-search.ts` — cosine similarity in [-1, 1]; higher = more relevant
- `hybrid-search.ts` — fused normalised score in [0, 1]; higher = more relevant

### 5. Answer Record

```json
{
  "output_id": "out-2026-04-10-answer-001",
  "question": "When should I use a persistent wiki instead of simple RAG?",
  "output_path": "outputs/2026-04-10-persistent-wiki-vs-rag.md",
  "evidence_used": ["wiki/concepts/rag.md", "wiki/topics/llm-wiki.md"],
  "should_review_for_feedback": true
}
```

### 6. Feedback Record

```json
{
  "output_id": "out-2026-04-10-answer-001",
  "decision": "propagate",
  "reason": "The answer introduced one grounded correction and one reusable open question",
  "source_refs": ["wiki/sources/2026-04-10-example-source.md"],
  "candidate_items": [
    {
      "item_id": "item-001",
      "target_note": "wiki/concepts/persistent-wiki.md",
      "change_type": "correction",
      "novelty": "correction",
      "source_support": ["src-2026-04-10-web-abc123"],
      "proposed_content": "Clarify that feedback evaluation is mandatory but propagation is conditional.",
      "outcome": "applied"
    }
  ],
  "affected_notes": ["wiki/concepts/persistent-wiki.md"],
  "mutation_plan_ref": "state/feedback/2026-04-10-answer-001-mutation-plan.json"
}
```

Feedback record rules:
- every candidate item must include `change_type`, `novelty`, `source_support`, and `outcome`
- valid `decision` values are `none`, `output_only`, or `propagate`
- valid `outcome` values are `applied`, `rejected`, or `deferred`
- if `decision` is `propagate`, the record should point to a mutation plan

### 7. Maintenance Result

Produced by `lint.ts` and `health-check.ts`.

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

```json
{
  "operation": "feedback",
  "commit_created": true,
  "commit_sha": "abc1234",
  "change_log_path": "state/change-log/2026-04-10T20-15-00Z-feedback.md"
}
```

### Contract Mapping

- `ingest-source.ts` → normalized source payload
- `plan-source-note.ts` or ingestion prompt → mutation plan
- `apply-update.ts` → mutation plan in, mutation result out
- `search.ts` → search result (BM25)
- `embed-index.ts` → writes `state/semantic/` (no stdout contract beyond status JSON)
- `semantic-search.ts` → search result (cosine similarity)
- `hybrid-search.ts` → search result (fused score) + `mode` field
- `answer-context.ts` → answer context packet
- `answer-record.ts` or answer workflow → answer record
- feedback evaluation → feedback record and optional mutation plan
- `lint.ts` / `health-check.ts` → maintenance result
- `commit.ts` → commit result

---

## Script Contracts

### `init-db.ts`
- creates base tables
- initializes FTS

### `ingest-source.ts`
- normalizes incoming raw input
- converts heterogeneous inputs into a stable internal shape
- extracts basic metadata needed by the ingestion prompt
- should be the only script that turns a raw event into a normalized ingestion payload

### `plan-source-note.ts`
- consumes a normalized source payload
- creates a safe baseline mutation plan for the source note and root index
- emits the matching commit input for the baseline ingestion run

### `reindex.ts`
- walks `wiki/`
- parses markdown and frontmatter
- updates SQLite rows
- rebuilds the FTS index
- ROLLBACK failures are logged at `error` level

### `search.ts`
- input: query string
- output: top-k documents as JSON (BM25 scores, negative)
- should search `wiki/`-derived state first, not `raw/`

### `embed-index.ts`
- input: CLI flags (`--vault`, `--rebuild`)
- output: JSON summary (`embedded`, `skipped`, `removed`, `total`); writes `state/semantic/` on disk
- incremental by default: only re-embeds documents whose normalised-text hash has changed
- `state/semantic/` is gitignored and local-only; must be (re)built on each deployment

### `semantic-search.ts`
- input: positional query string, `--vault`, `--limit`
- output: `SearchResult` JSON (same contract as `search.ts`, scores in [-1, 1])
- requires the semantic index to exist; returns an empty result list if it does not

### `hybrid-search.ts`
- input: positional query string, `--vault`, `--limit`
- output: `SearchResult` JSON with an extra `mode` field (`"hybrid"` or `"fts"`)
- falls back to pure FTS when the semantic index is absent

### `answer-context.ts`
- consumes a question plus search result payload
- reads retrieved `wiki/**` markdown files
- emits bounded markdown context and an answer record shell
- should not mutate the wiki

### `answer-record.ts`
- consumes generated answer text plus an answer record shell
- writes the answer artifact under `outputs/`
- emits the canonical answer record for feedback evaluation
- should not mutate the wiki

### `apply-update.ts`
- input: structured JSON mutation plan
- allowed actions: create file, update file, update index pages
- **hard guard**: any `create` action whose path starts with `wiki/topics/` throws immediately
- `update` actions on existing topic files are allowed

### `lint.ts`
- performs structural linting of the markdown knowledge base
- detects maintainability issues such as oversize pages, inconsistent naming, incomplete frontmatter, orphan pages, and stale indexes
- should focus on structure and maintainability, not semantic truth

### `health-check.ts`
- performs a deeper semantic and traceability review
- detects contradictions, unsupported claims, concept gaps, stale low-confidence notes
- emits `concept-topic-candidate` suggestion findings for concepts whose total link count exceeds `CONCEPT_TOPIC_CANDIDATE_THRESHOLD` (default 8)
- excludes `wiki/projects/` from all checks
- with `--write`: auto-applies allowed mutations
- **never creates new topic files**

### `feedback-record.ts`
- produces the canonical machine-readable feedback record
- may emit a derived mutation plan when the decision is `propagate`
- must separate feedback evaluation from actual wiki mutation

### `commit.ts`
- stages intended changes
- writes consistent git commit messages
- records a structured change log entry

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `LLM_API_KEY` | — | Required. API key for the LLM provider. |
| `LLM_API_KEY_HEADER` | `Authorization` | Custom header name for API key. When set to a name other than `Authorization`, the key is sent raw in that header. |
| `LLM_BASE_URL` | — | OpenAI-compatible base URL. |
| `LLM_MODEL` | — | Optional model ID override. |
| `LLM_ANSWER_TEMPERATURE` | `0.2` | LLM temperature for answer synthesis. |
| `EMBED_MODEL` | `Xenova/multilingual-e5-small` | Override the embedding model without code changes. Used by `embed-index.ts`, `semantic-search.ts`, `hybrid-search.ts`. |
| `EMBED_MAX_OLD_SPACE_MB` | `3072` | Node.js heap limit for `embed-index.ts`. |
| `TOPIC_MATCH_THRESHOLD` | `0.72` | Float in [0,1]. Cosine similarity threshold for redirecting a concept term to an existing topic update in `resolve-terms.ts`. |
| `CONCEPT_TOPIC_CANDIDATE_THRESHOLD` | `8` | Integer. Total wikilink count above which `health-check.ts` emits a concept-topic-candidate suggestion. |
| `TELEGRAM_BOT_TOKEN` | — | Telegram bot token. |
| `TELEGRAM_CHAT_ID` | — | Allowed incoming chat id and default output chat for logs. |
| `TELEGRAM_BOT_LOCK_TTL_MS` | `1800000` | Stale-lock timeout in milliseconds. |
| `LOG_LEVEL` | `info` | Minimum level written to `state/logs/app.log`. Accepted values: `trace`, `debug`, `info`, `warn`, `error`, `fatal`. Set to `debug` to capture full LLM prompt and response payloads. |
| `N8N_BLOCK_ENV_ACCESS_IN_NODE` | — | Set to `false` to allow n8n Code nodes to read environment variables. |
| `GIT_AUTHOR_NAME` / `GIT_AUTHOR_EMAIL` | — | Git identity for `commit.ts` when `git config user.*` is not set. |
| `GIT_COMMITTER_NAME` / `GIT_COMMITTER_EMAIL` | — | Git committer identity. |

---

## Change Log Policy

Use three layers:

### 1. Git History
- authoritative history of file diffs
- rollback and audit layer

### 2. Structured System Logs
- store detailed operational change records in `state/change-log/`

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

- keep only small traceability fields inside notes: `updated`, `updated_by`, `source_refs`, `change_reason`
- do not create long `Change Log` sections inside concept, entity, topic, or source pages

---

## Feedback Record Policy

Change logs answer: what changed operationally.
Feedback records answer: why a generated output did or did not change the knowledge base.

Every significant answer, briefing, or analysis must end with a recorded feedback decision, even if the decision is `none`.

### Output Propagation Rules

- never copy an entire answer back into the wiki
- propagate note-sized changes, not essay-sized blobs
- every propagated item must have explicit source support
- if a useful answer yields no safe wiki change, record `output_only` and stop

---

## Persistence Policy

Classify candidate knowledge using both novelty and actionability.

Candidate novelty: `already_present`, `better_wording`, `net_new`, `correction`, `speculative`, `unsupported`

Candidate change type: `fact`, `new_link`, `open_question`, `split_suggestion`

Persist only:
- `net_new` with grounding
- `correction` with grounding
- `better_wording` when it improves clarity without losing meaning
- `open_question` when it captures a recurring unresolved gap

Do not persist: decorative summaries, unsupported conclusions, low-value repetition, temporary conversational context.

Default persistence order:
1. decide `none`, `output_only`, or `propagate`
2. if `propagate`, update the smallest relevant note set
3. reindex
4. commit with a feedback record

---

## Pipeline Reliability

### LLM Retry

`lib/llm.ts` wraps every `chatCompletion` call with exponential-backoff retry (up to 3 attempts, base delay 15 s). Only retryable status codes (429, 5xx) and network errors trigger a retry. Client errors (4xx except 429) are thrown immediately.

### Transactional Rollback — `lib/pipeline-tx.ts`

`PipelineTx` implements a saga-style compensating transaction:

```text
tx = new PipelineTx()
tx.onRollback("name", async () => { /* compensating action */ })
// ... mutation steps ...
// on failure:
await tx.rollback(log)  // executes handlers in registration order; each is isolated
```

Handlers execute in registration order (not reverse). A failure in one handler is logged at `error` level and does not prevent remaining handlers from running. If no handlers were registered (failure before any mutation), `rollback()` is a no-op.

`lib/git.ts` provides `getGitHead(cwd)` (returns null when git is unavailable) and `gitResetHard(cwd, sha)` for use inside compensating actions.

---

## Safety And Operations

### Deployment Context

- self-hosted `n8n`, VM environment, VPN-restricted access, single-user oriented
- vault mounted through WebDAV or equivalent

### Required Mitigations

- trigger only on `raw/`
- never trigger automatically on `wiki/`
- ignore `.obsidian/`, `state/`, `outputs/`, `*.db`, `.git/`
- never execute commands from note content
- keep mutation scripts deterministic

### Trigger Policy

React to changes in `raw/` only. Treat `wiki/` as derived state, not as an event source. Reindex `wiki/` after controlled updates, not because `wiki/` itself changed.

---

## Common CLI Conventions

Most scripts accept these shared flags:

- `--vault <path>`: choose the vault root, defaulting to the current working directory.
- `--input <file>`: load JSON input from a file instead of `stdin`.
- `--compact`: emit compact JSON instead of pretty-printed JSON.
- `--no-write`: disable artifact writes for scripts that can run in read-only mode.

Scripts that work with SQLite additionally accept `--db <path>`, and `search.ts` also accepts `--limit <n>`.

Use `npm run --silent <script> -- ...` when stdout is consumed by n8n or another JSON parser.

---

## Tests

The test suite uses Node's built-in `node:test` runner and executes the compiled JavaScript under `dist/`.

- `npm test` builds the TypeScript source and runs all tests.
- `npm run test:coverage` builds the source, runs the tests, and prints Node's coverage report.

The suite covers shared libraries directly and exercises every CLI entrypoint through temporary vaults and local git repositories.

---

## Design Notes

- The code always treats `wiki/` as derived state, not as a trigger source.
- File writes are explicit, bounded to the vault root, and driven by structured JSON.
- Markdown rendering favors targeted merges over broad rewrites.
- Reporting scripts can write summaries, but their canonical outputs remain JSON objects.
