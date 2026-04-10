<div align="center">
  <img src="docs/assets/logo.svg" alt="dps-wiki-llm logo" width="132">
  <h1>dps-wiki-llm</h1>
  <p><strong>Deterministic Node.js tooling for a persistent markdown-based knowledge system.</strong></p>
  <p><code>raw/</code> for events, <code>wiki/</code> for curated state, <code>state/</code> for indexes and logs, and <code>outputs/</code> for artifacts.</p>
</div>

## Overview

`dps-wiki-llm` is the local, deterministic tooling layer of a persistent knowledge workflow built around `raw -> wiki -> state -> outputs`.

The repository is responsible for:

- applying controlled markdown updates to a vault
- indexing `wiki/**/*.md` into SQLite FTS
- querying the index for retrieval
- generating maintenance reports
- recording feedback and git-backed change logs

The repository is not the orchestration layer. `n8n`, LLM planning, and answer synthesis are expected to sit around these scripts, not inside them.

## Architecture Boundaries

- `raw/` is the reactive event stream.
- `wiki/` is stable derived state.
- Only trigger automation on `raw/**`.
- Never trigger automation on `wiki/**`.
- Generated answers do not update the wiki directly.
- Feedback evaluation is mandatory; propagation is conditional.

Breaking the `raw/` versus `wiki/` boundary creates loops, noisy state, and non-deterministic behavior.

## Implemented Tooling

The repo now includes the full local toolchain except for raw-event normalization and the external LLM orchestration steps.

| Script | Purpose | Main outputs |
|---|---|---|
| `init-db.mjs` | Creates the SQLite schema and FTS tables. | `state/kb.db` |
| `apply-update.mjs` | Applies a Mutation Plan to markdown files with idempotency tracking. | `wiki/**`, `INDEX.md`, `state/runtime/idempotency-keys.json` |
| `feedback-record.mjs` | Writes feedback records and can derive a follow-up mutation plan. | `state/feedback/**` |
| `reindex.mjs` | Rebuilds the `docs` table and FTS index from `wiki/**/*.md`. | `state/kb.db` |
| `search.mjs` | Runs FTS queries and returns ranked results as JSON. | stdout JSON |
| `lint.mjs` | Performs structural wiki checks. | `state/maintenance/*-lint.{json,md}` |
| `health-check.mjs` | Performs deeper semantic and traceability checks. | `state/maintenance/*-health-check.{json,md}` |
| `commit.mjs` | Stages material paths, writes a structured change log, and creates a git commit. | `state/change-log/**`, git commit |

Main gaps relative to the target architecture:

- `ingest-source.mjs` is not present yet
- `n8n` workflows are out of repo scope
- LLM planner and answer-synthesis steps are external to this codebase

## Code Documentation

Detailed English documentation for every script and shared library module lives in [`docs/code-reference.md`](docs/code-reference.md).

## Repository Structure

```text
.
├── README.md
├── package.json
├── docs/
│   ├── code-reference.md
│   ├── assets/
│   │   └── logo.svg
│   └── diagrams/
│       ├── workflow.puml
│       └── workflow.svg
└── tools/
    ├── init-db.mjs
    ├── apply-update.mjs
    ├── feedback-record.mjs
    ├── reindex.mjs
    ├── search.mjs
    ├── lint.mjs
    ├── health-check.mjs
    ├── commit.mjs
    └── lib/
```

Expected vault layout:

```text
vault/
├── raw/
├── wiki/
├── state/
└── outputs/
```

## Workflow

The diagram below summarizes the intended workflow. Green nodes are scripts already present in this repo; yellow nodes are planned or external components.

Rendered using the official PlantUML web service:

![Workflow dps-wiki-llm](docs/diagrams/workflow.svg)

Canonical source: [`docs/diagrams/workflow.puml`](docs/diagrams/workflow.puml)  
Versioned render: [`docs/diagrams/workflow.svg`](docs/diagrams/workflow.svg)

## Typical Usage

Requirements:

- a recent Node.js release with built-in `node:sqlite` support
- Git configured with `user.name` and `user.email` if you plan to use `commit.mjs`

Initialize the database:

```bash
npm run init-db -- --vault /path/to/vault
```

Apply a mutation plan:

```bash
npm run apply-update -- --vault /path/to/vault --input ./plan.json
```

Rebuild the search index:

```bash
npm run reindex -- --vault /path/to/vault
```

Run a search query:

```bash
npm run search -- --vault /path/to/vault "model context protocol" --limit 5
```

Record feedback:

```bash
npm run feedback-record -- --vault /path/to/vault --input ./feedback.json
```

Run maintenance checks without writing reports:

```bash
npm run lint -- --vault /path/to/vault --no-write
npm run health-check -- --vault /path/to/vault --no-write
```

Create a structured commit:

```bash
npm run commit -- --vault /path/to/vault --input ./commit.json
```

## CLI Conventions

- `--vault` is the root of the target vault and defaults to the current working directory.
- `--input` is used by JSON-driven scripts such as `apply-update.mjs`, `feedback-record.mjs`, and `commit.mjs`.
- `--db` can override the database path for `init-db.mjs`, `reindex.mjs`, and `search.mjs`.
- `--limit` controls result count in `search.mjs`.
- `--no-write` is supported by `feedback-record.mjs`, `lint.mjs`, and `health-check.mjs`.
- Scripts emit machine-readable JSON on success.

## Operational Notes

- `apply-update.mjs` enforces `create`, `update`, and `noop` actions and tracks idempotency keys in `state/runtime/idempotency-keys.json`.
- `reindex.mjs` indexes markdown derived from `wiki/`, not `raw/`.
- `search.mjs` queries the FTS index and returns ranked results with `path`, `title`, `doc_type`, and `score`.
- `lint.mjs` focuses on structure and maintainability.
- `health-check.mjs` focuses on unsupported claims, stale low-confidence notes, and missing pages.
- `commit.mjs` writes a change log to `state/change-log/` before creating the git commit.
- `docs/code-reference.md` is the file-level reference for the entire codebase.
