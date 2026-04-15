# Code Reference

This document is the English reference for the repository's implementation. It explains what every executable script and shared library module does, what inputs it expects, and how the code fits into the larger `raw -> wiki -> state -> outputs` workflow.

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

## Shared Libraries

| File | Responsibility | Notes |
|------|----------------|-------|
| `tools/config.ts` | Central behavior configuration for paths, thresholds, valid enum values, SQLite setup, and report locations. | Avoids scattering system constants across scripts. |
| `tools/lib/contracts.ts` | TypeScript interfaces for the JSON contracts defined in `AGENTS.md`. | Covers mutation plans, feedback records, search results, maintenance results, and commit results. |
| `tools/lib/cli.ts` | Common CLI parsing and JSON input/output helpers. | Keeps every script callable from shells and orchestration systems in the same way. |
| `tools/lib/db.ts` | SQLite connection setup, schema creation, and FTS rebuild helpers. | Wraps `node:sqlite` with repository-specific pragmas. |
| `tools/lib/fs-utils.ts` | Safe path resolution and filesystem helpers scoped to a vault root. | Enforces the "do not write outside the vault" boundary. |
| `tools/lib/frontmatter.ts` | Minimal YAML-like parser, serializer, and merge logic for note frontmatter. | Supports the subset of frontmatter needed by the wiki tooling. |
| `tools/lib/llm.ts` | Runtime LLM chat-completion helper used by the macro scripts. | Reads `LLM_API_KEY`, optional `LLM_API_KEY_HEADER`, model, base URL, and answer temperature from the command runtime environment. |
| `tools/lib/markdown.ts` | Markdown section parsing and idempotent note rendering. | Merges content by section instead of performing broad rewrites. |
| `tools/lib/run-tool.ts` | Helper for macro scripts to call sibling compiled tool scripts with JSON passed through temporary files. | Avoids large command-line arguments and keeps script composition explicit. |
| `tools/lib/text.ts` | Shared hashing, slugging, truncation, and summary helpers. | Keeps artifact naming deterministic across scripts. |
| `tools/lib/wiki-inspect.ts` | Wiki loading, metadata extraction, link parsing, and graph analysis. | Powers reindexing, linting, and health checks. |
| `tools/lib/embedding-provider.ts` | `EmbeddingProvider` interface — the single abstraction point for all text-embedding backends. | Allows swapping local, remote, or stub implementations without changing callers. |
| `tools/lib/local-transformers-provider.ts` | CPU-local embedding implementation using `@xenova/transformers` (ONNX Runtime). | Downloads the model on first use; all subsequent runs are fully offline. |
| `tools/lib/semantic-index.ts` | Core data layer for the semantic index: manifest CRUD, text normalization, cosine similarity, and per-document embedding I/O. | Consumed by `embed-index`, `semantic-search`, and `hybrid-search`. |

## Execution Model

The scripts follow a deterministic local execution model:

1. A workflow or operator calls a package script with CLI flags and optional JSON input.
2. The script resolves every path inside a vault root.
3. Shared libraries handle markdown parsing, graph inspection, or SQLite updates.
4. The script returns machine-readable JSON for the caller.

This keeps orchestration logic outside the scripts while keeping fragile, stateful operations local and explicit.

## Module Details

### `tools/init-db.ts`

- Resolves the vault root and the optional database path.
- Opens the SQLite database through `tools/lib/db.ts`.
- Ensures the base `docs` table and `docs_fts` virtual table exist.
- Returns the database path relative to the vault root.

Use this script before the first reindex or search run against a new vault.

### `tools/ingest-source.ts`

- Accepts a raw event object containing `raw_path`, `path`, `filePath`, or `filename`.
- Rejects inputs outside `raw/**`.
- Reads the raw artifact, parses optional frontmatter, computes a SHA-256 checksum, and infers source kind from the raw folder.
- Emits the canonical Normalized Source Payload used by downstream planners.

This is the only local script that turns a raw event into a normalized ingestion payload.

### `tools/youtube-transcript.ts`

- Accepts a YouTube video URL and optional language preferences.
- Loads YouTube subtitle metadata and subtitle files through `yt-dlp`, selecting a manual track when possible and falling back to available autogenerated subtitles.
- Writes the transcript as a `raw/web/**` markdown artifact with source metadata and timestamped caption lines.
- Returns `status: "failed"` with a reason for handled cases such as missing subtitles, so n8n can send a Telegram log without mutating the wiki.

### `tools/ingest-run.ts`

- Accepts a raw event or Telegram `/ingest` payload and keeps the `raw/**` trigger boundary intact.
- For YouTube ingest payloads, calls `youtube-transcript.ts` first and returns a handled failure JSON if subtitles cannot be written.
- Calls `ingest-source.ts`, obtains an LLM-cleaned `source_note`, builds the baseline plan with `plan-source-note.ts`, applies it, reindexes, and commits.
- For wiki context retrieval (step 9), checks whether `state/semantic/manifest.json` exists: uses `hybrid-search` when the semantic index is available, falls back to `search` otherwise.
- Requests a second LLM Mutation Plan for reusable wiki updates, validates it with guardrails, and applies only safe non-empty plans.
- Emits Telegram message payloads for n8n to send, without requiring n8n to hold the ingest business logic.

### `tools/plan-source-note.ts`

- Accepts a Normalized Source Payload, optionally enriched with `source_note`.
- Builds a Mutation Plan that creates a `wiki/sources/` note and updates `INDEX.md`.
- Uses `source_note.summary`, `source_note.raw_context`, `source_note.extracted_claims`, and `source_note.open_questions` when provided; otherwise keeps the deterministic fallback for direct CLI usage.
- Includes idempotency keys, source references, and a matching Commit input payload.
- Acts as the safe baseline planner for source-note creation.

The production ingest path now calls this planner from `ingest-run.ts` after the macro script obtains an LLM-cleaned `source_note`, then adds a separate guardrail-validated LLM Mutation Plan when ingestion should also update concepts, entities, topics, or analyses.

### `tools/reindex.ts`

- Loads every markdown document under `wiki/`.
- Clears the `docs` table inside a single write transaction.
- Inserts the latest document metadata and body text.
- Rebuilds the FTS table using SQLite's `rebuild` command.

The implementation is intentionally full-rebuild and deterministic rather than incremental.

### `tools/search.ts`

- Accepts the query as the first positional argument.
- Normalizes natural-language queries into an FTS expression with stopword removal and a small bilingual synonym expansion.
- Resolves the target database file inside the vault.
- Queries `docs_fts` and joins back to `docs` for path, title, and type metadata.
- Returns ranked results using SQLite `bm25`.

It searches only derived wiki state, never `raw/`.

### `tools/embed-index.ts`

- Scans every `*.md` file under `wiki/` recursively.
- For each file: normalises the text (strips frontmatter, wikilinks, markdown syntax), computes a 16-hex SHA-256 fingerprint, and compares it against the stored hash in `state/semantic/manifest.json`.
- Files whose hash has not changed since the last run are skipped with no model inference (incremental strategy).
- New and changed files are embedded with `createLocalTransformersProvider` and written as individual JSON units under `state/semantic/notes/`.
- Manifest entries for files that were deleted from disk are pruned so stale vectors cannot pollute future search results.
- The `--rebuild` flag bypasses the hash check and re-embeds all documents unconditionally.
- On first run (no manifest yet) all documents are embedded; subsequent runs are fast incremental updates.

Must be run at least once before `semantic-search` or `hybrid-search` can return semantic results.

### `tools/semantic-search.ts`

- Accepts the query as the first positional argument (same convention as `search.ts`).
- Loads the full manifest and all embedding units from `state/semantic/` into memory.
- Embeds the query using the same model that was used to build the index (model mismatch would produce vectors in different spaces, giving meaningless scores).
- Scores every indexed unit with cosine similarity and returns the top `--limit` results.
- Output is structurally identical to the `SearchResult` contract produced by `search.ts`, so callers treat both uniformly.
- Returns an empty result list (not an error) when the index has not been built yet.

Brute-force nearest-neighbour is used intentionally: at personal-wiki scale it is faster than ANN due to zero setup cost.

### `tools/hybrid-search.ts`

- Checks whether `state/semantic/manifest.json` exists; if not, falls back to pure FTS (no error).
- When the index is available, spawns `search` and `semantic-search` in parallel, each fetching `limit × 3` candidates (over-fetch so documents exclusive to one leg can still rank in the final top-K).
- Applies min-max normalisation independently to each result list, mapping both to `[0, 1]`.  This is necessary because BM25 scores from SQLite FTS5 are negative log-probability sums while cosine similarities are in `[-1, 1]`.
- Computes a weighted linear combination: `finalScore = 0.6 × semanticNorm + 0.4 × lexicalNorm`.
- Sorts the fused candidates by descending score and returns the top `--limit` results.
- The `mode` field in the output is `"hybrid"` or `"fts"` so callers can tell which path was taken.

Used by `answer-run.ts` (default mode) and `ingest-run.ts` (wiki context retrieval) when the semantic index is present.

### `tools/answer-context.ts`

- Accepts a question and Search Result JSON.
- Reads the retrieved `wiki/**` markdown files from the vault.
- Strips frontmatter and includes bounded body text in `context_docs`.
- Creates the Answer Record shell that the answer workflow should carry into answer persistence and feedback evaluation.

This script keeps markdown reads local and deterministic instead of making n8n code nodes perform filesystem logic.

### `tools/answer-record.ts`

- Accepts an `answer_record` object plus the generated answer text.
- Writes the answer artifact under `outputs/`.
- Emits the canonical Answer Record JSON for downstream feedback review.

The answer artifact is operational output; it does not mutate the semantic wiki.

### `tools/answer-run.ts`

- Accepts a direct question or Telegram update payload.
- Reads the optional `retrieval_mode` field from the input (`"fts"`, `"semantic"`, or `"hybrid"`; defaults to `"hybrid"`).
- Checks whether `state/semantic/manifest.json` exists; if the requested mode requires the semantic index and it is absent, falls back to `"fts"` automatically.
- Routes the retrieval step to `hybrid-search`, `semantic-search`, or `search` accordingly.
- Calls `answer-context.ts` to retrieve bounded wiki evidence, then the LLM for answer synthesis.
- Persists the result with `answer-record.ts` and validates the feedback proposal with `feedback-record.ts --no-write`.
- Returns an approval payload for `KB - Apply Feedback` when feedback decision is `propagate`.
- Emits Telegram message payloads for n8n to send, while preserving the rule that answers do not mutate `wiki/`.

### `tools/apply-update.ts`

- Validates the Mutation Plan shape before writing.
- Maintains `state/runtime/idempotency-keys.json` to avoid duplicate application.
- Uses `renderMarkdown` to merge frontmatter and sections rather than replacing whole files.
- Applies index updates through the same markdown rendering path.

The important behavior here is idempotent, small-scope mutation with explicit paths.

### `tools/feedback-record.ts`

- Validates feedback decisions and candidate items.
- Enforces that propagated items must include source support.
- Writes a canonical JSON feedback artifact and a compact markdown summary.
- Derives a Mutation Plan when the decision is `propagate`.

This script keeps "evaluate feedback" separate from "apply wiki mutation".

### `tools/lint.ts`

- Loads every wiki document and analyzes the wiki link graph.
- Detects structural issues such as oversized notes, inconsistent names, missing frontmatter, and orphan pages.
- Can persist both a JSON report and a markdown summary under `state/maintenance/`.

It focuses on maintainability and structure, not semantic truth.

### `tools/health-check.ts`

- Reuses the wiki graph plus section metadata from `wiki-inspect.ts`.
- Checks for unsupported factual content, stale low-confidence notes, source-note traceability gaps, and missing-page references.
- Can persist both a JSON report and a markdown summary under `state/maintenance/`.

It is the semantic complement to `lint.ts`.

### `tools/commit.ts`

- Normalizes commit metadata from JSON input.
- Stages only the files relevant to the operation.
- Writes a structured markdown change log into `state/change-log/`.
- Requires Git identity before committing, from `git user.name`/`git user.email` or standard Git author/committer environment variables.

This script records operational traceability without turning semantic notes into change logs.

### `tools/config.ts`

- Defines canonical vault-relative paths such as `wiki/`, `state/kb.db`, `state/feedback/`, and `state/change-log/`.
- Defines behavior constants such as valid mutation actions, ingest defaults, answer artifact defaults, valid feedback decisions, lint thresholds, health-check staleness thresholds, and default search limit.
- Owns the SQLite schema strings and pragmas used by `tools/lib/db.ts`.
- Owns markdown section behavior such as bullet-oriented sections.

Change system behavior here first instead of duplicating constants inside individual scripts.

### `tools/lib/contracts.ts`

- Encodes the JSON interface contracts from `AGENTS.md` as TypeScript interfaces.
- Provides shared types for `MutationPlan`, `MutationResult`, `FeedbackRecord`, `MaintenanceResult`, `CommitResult`, wiki docs, graph analysis, and CLI args.
- Keeps script inputs and outputs aligned with the documented machine-readable payload shapes.

### `tools/lib/cli.ts`

- `parseArgs` provides a shared flag vocabulary used across scripts.
- `readJsonInput` loads JSON from a file or from `stdin`.
- `writeJsonStdout` guarantees consistent machine-readable output formatting.

This module keeps command-line behavior uniform across the toolchain.

### `tools/lib/db.ts`

- Lazily imports `node:sqlite` only when needed.
- Suppresses the experimental warning for the built-in SQLite module.
- Applies consistent pragmas for WAL mode, foreign keys, and temp storage.
- Exposes `ensureSchema` and `rebuildFts` as the minimal database contract used by the scripts.

### `tools/lib/fs-utils.ts`

- Resolves the vault root and blocks path traversal outside it.
- Creates directories and parent directories on demand.
- Provides safe read/write helpers for text and JSON files.
- Converts filesystem paths to normalized POSIX-style vault paths for stored metadata.

This module is the main safety boundary for local filesystem access.

### `tools/lib/frontmatter.ts`

- Implements a small parser for the subset of YAML used in note frontmatter.
- Supports scalars, arrays, nested objects, and comment skipping.
- Serializes frontmatter back to a deterministic markdown-friendly format.
- Merges nested frontmatter objects and arrays without duplicating values.

The implementation is intentionally narrow and dependency-free.

### `tools/lib/markdown.ts`

- Parses a note body into title, preamble, and `##` sections.
- Detects whether a section should be rendered as bullets or paragraphs.
- Merges section content idempotently to avoid duplicate bullets or paragraphs.
- Rebuilds the final markdown document with merged frontmatter and content.

This is the core note renderer used by `apply-update.ts`.

### `tools/lib/llm.ts`

- Centralizes LLM-compatible chat completion calls used by `answer-run.ts` and `ingest-run.ts`.
- Reads `LLM_API_KEY` at runtime and supports `LLM_API_KEY_HEADER` for providers that require a custom API-key header.
- Uses `Authorization: Bearer <key>` when the header name is `Authorization`; otherwise it sends the raw key in the configured header.
- Provides JSON extraction and response metadata helpers so macro scripts do not duplicate LLM parsing code.

### `tools/lib/run-tool.ts`

- Lets macro scripts call sibling compiled scripts under `dist/tools/`.
- Writes JSON input to temporary files instead of sending large JSON through shell arguments.
- Keeps the n8n command surface small while preserving explicit script boundaries.

### `tools/lib/text.ts`

- Provides stable hashes for IDs and idempotency-friendly artifacts.
- Provides filesystem-safe slugs with deterministic fallbacks.
- Provides bounded text truncation and first-paragraph extraction.

The helper is intentionally small so scripts can share naming behavior without adding broad dependencies.

### `tools/lib/wiki-inspect.ts`

- Walks `wiki/` recursively and loads every markdown file.
- Extracts frontmatter, title, updated date, section metadata, and wiki links.
- Builds alias maps so links can resolve by title, basename, or path stem.
- Produces graph structures for inbound links, broken links, and ambiguous targets.

This module is the shared read-model for indexing and maintenance workflows.

### `tools/lib/embedding-provider.ts`

- Defines the `EmbeddingProvider` interface with three members: `model` (string identifier for provenance), `dimension` (vector length), and `embed(texts)` (returns one vector per input).
- Purely a type/contract definition; no I/O or dependencies.
- Allows unit tests to inject a stub provider without loading any ML models.
- Allows future providers (remote API, different local runtime) to be added without changing `embed-index.ts` or `semantic-search.ts`.

### `tools/lib/local-transformers-provider.ts`

- Implements `EmbeddingProvider` using `@xenova/transformers` (ONNX Runtime, CPU only).
- Uses a dynamic `import()` so the WASM bootstrap and model cache initialization only run when the first `embed` call is made, keeping cold-start time low for tools that do not use embeddings.
- Loads quantised (INT8) model weights (`quantized: true`), which are ~4× smaller and faster on CPU with negligible quality loss for retrieval tasks.
- Handles two output tensor shapes across `@xenova/transformers` API versions: `tolist()` (older) and `.data`/`.dims` (newer).
- Applies mean pooling over the sequence-length axis to reduce the per-token output tensor `[1, seq_len, dim]` to a single `[dim]` document vector — the standard approach for bi-encoder retrieval models (BGE, E5, Sentence-Transformers).
- Processes texts one at a time within the configured batch to avoid attention-mask distortion from padding mixed-length sequences together.
- The pipeline singleton is module-scoped, so multiple calls to `createLocalTransformersProvider` in the same process share one loaded ONNX session.

### `tools/lib/semantic-index.ts`

Provides four groups of exports:

**Types:** `EmbeddingUnit` (the persisted record for one note, including its vector and hash), `ManifestItem` (path + hash entry in the registry), `SemanticManifest` (top-level index file schema).

**Path helpers:** `semanticDirPath`, `manifestPath`, and the private `embeddingFilePath` which converts a note ID to a safe flat filename (path separators replaced by `__`, `#` replaced by `_`).

**I/O helpers:** `loadManifest` / `saveManifest` for the registry file; `saveEmbeddingUnit` / `loadEmbeddingUnit` / `loadAllEmbeddingUnits` for per-note JSON files. All readers return `null` or a sentinel instead of throwing on missing files.

**Algorithms:**
- `normalizeTextForEmbedding` — strips YAML frontmatter, converts `[[wikilinks]]` to plain text, removes markdown link/image syntax, removes bare URLs, strips heading markers (`##`), and collapses all whitespace to a single space. The result is a clean single-line string for the tokeniser.
- `hashText` — first 16 hex characters of SHA-256 over the normalised text. 64 bits of collision resistance is sufficient for change detection across a personal wiki.
- `cosineSimilarity` — pure TypeScript dot-product-over-norms implementation; handles mismatched lengths and zero-norm vectors by returning 0.

## Common CLI Conventions

Most scripts accept these shared flags:

- `--vault <path>`: choose the vault root, defaulting to the current working directory.
- `--input <file>`: load JSON input from a file instead of `stdin`.
- `--compact`: emit compact JSON instead of pretty-printed JSON.
- `--no-write`: disable artifact writes for scripts that can run in read-only mode.

Scripts that work with SQLite additionally accept `--db <path>`, and `search.ts` also accepts `--limit <n>`.

Use `npm run --silent <script> -- ...` when stdout is consumed by n8n or another JSON parser. The scripts themselves emit JSON, while non-silent npm output can add command banners.

## Tests

The test suite uses Node's built-in `node:test` runner and executes the compiled JavaScript under `dist/`.

- `npm test` builds the TypeScript source and runs all tests.
- `npm run test:coverage` builds the source, runs the tests, and prints Node's coverage report.

The suite covers shared libraries directly and exercises every CLI entrypoint through temporary vaults and local git repositories.

## Design Notes

- The code always treats `wiki/` as derived state, not as a trigger source.
- File writes are explicit, bounded to the vault root, and driven by structured JSON.
- Markdown rendering favors targeted merges over broad rewrites.
- Reporting scripts can write summaries, but their canonical outputs remain JSON objects.
