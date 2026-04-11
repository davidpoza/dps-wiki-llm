# Code Reference

This document is the English reference for the repository's implementation. It explains what every executable script and shared library module does, what inputs it expects, and how the code fits into the larger `raw -> wiki -> state -> outputs` workflow.

## Entry Points

| File | Purpose | Main Input | Main Output |
|------|---------|------------|-------------|
| `tools/init-db.ts` | Creates the SQLite database file and ensures the base schema exists. | CLI flags such as `--vault` and optional `--db`. | JSON with `db_path` and `initialized`. |
| `tools/ingest-source.ts` | Normalizes a `raw/**` artifact into the canonical source payload. | Raw event JSON via `--input` or `stdin`. | Normalized Source Payload JSON. |
| `tools/plan-source-note.ts` | Builds the deterministic baseline ingestion plan for creating a source note. | Normalized Source Payload JSON via `--input` or `stdin`. | JSON containing `mutation_plan` and `commit_input`. |
| `tools/reindex.ts` | Scans wiki markdown files and rebuilds the relational and FTS indexes. | CLI flags such as `--vault` and optional `--db`. | JSON with indexed document count and rebuilt status. |
| `tools/search.ts` | Runs a full-text search query against `state/kb.db`. | Positional search query plus CLI flags. | JSON search result payload with ranked documents. |
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
| `tools/lib/markdown.ts` | Markdown section parsing and idempotent note rendering. | Merges content by section instead of performing broad rewrites. |
| `tools/lib/text.ts` | Shared hashing, slugging, truncation, and summary helpers. | Keeps artifact naming deterministic across scripts. |
| `tools/lib/wiki-inspect.ts` | Wiki loading, metadata extraction, link parsing, and graph analysis. | Powers reindexing, linting, and health checks. |

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

### `tools/plan-source-note.ts`

- Accepts a Normalized Source Payload.
- Builds a deterministic Mutation Plan that creates a `wiki/sources/` note and updates `INDEX.md`.
- Includes idempotency keys, source references, and a matching Commit input payload.
- Acts as the safe baseline planner for source-note creation.

The production OpenRouter ingest workflow keeps this baseline and adds a separate LLM-proposed Mutation Plan for human review when ingestion should also update concepts, entities, topics, or analyses.

### `tools/reindex.ts`

- Loads every markdown document under `wiki/`.
- Clears the `docs` table inside a single write transaction.
- Inserts the latest document metadata and body text.
- Rebuilds the FTS table using SQLite's `rebuild` command.

The implementation is intentionally full-rebuild and deterministic rather than incremental.

### `tools/search.ts`

- Accepts the query as the first positional argument.
- Resolves the target database file inside the vault.
- Queries `docs_fts` and joins back to `docs` for path, title, and type metadata.
- Returns ranked results using SQLite `bm25`.

It searches only derived wiki state, never `raw/`.

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
- Requires `git user.name` and `git user.email` to be configured before committing.

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
