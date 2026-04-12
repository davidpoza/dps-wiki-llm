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

The repository is not the orchestration layer. `n8n`, LLM planning, and answer synthesis sit around these scripts, not inside them.

## Architecture Boundaries

- `raw/` is the reactive event stream.
- `wiki/` is stable derived state.
- Only trigger automation on `raw/**`.
- Never trigger automation on `wiki/**`.
- Generated answers do not update the wiki directly.
- Feedback evaluation is mandatory; propagation is conditional.

Breaking the `raw/` versus `wiki/` boundary creates loops, noisy state, and non-deterministic behavior.

## Implemented Tooling

The repo now includes the deterministic local toolchain plus importable n8n workflows for a manual OpenRouter production cut. The scripts remain deterministic; OpenRouter calls live in n8n workflow nodes.

| Script | Purpose | Main outputs |
|---|---|---|
| `init-db.ts` | Creates the SQLite schema and FTS tables. | `state/kb.db` |
| `ingest-source.ts` | Normalizes a `raw/**` artifact into the canonical source payload. | stdout JSON |
| `plan-source-note.ts` | Builds a safe baseline Mutation Plan that creates the source note and root index entry. | stdout JSON |
| `apply-update.ts` | Applies a Mutation Plan to markdown files with idempotency tracking. | `wiki/**`, `INDEX.md`, `state/runtime/idempotency-keys.json` |
| `answer-context.ts` | Reads retrieved wiki notes and builds the LLM context packet plus Answer Record shell. | stdout JSON |
| `answer-record.ts` | Persists a generated answer artifact under `outputs/`. | `outputs/**` |
| `feedback-record.ts` | Writes feedback records and can derive a follow-up mutation plan. | `state/feedback/**` |
| `reindex.ts` | Rebuilds the `docs` table and FTS index from `wiki/**/*.md`. | `state/kb.db` |
| `search.ts` | Runs FTS queries and returns ranked results as JSON. | stdout JSON |
| `lint.ts` | Performs structural wiki checks. | `state/maintenance/*-lint.{json,md}` |
| `health-check.ts` | Performs deeper semantic and traceability checks. | `state/maintenance/*-health-check.{json,md}` |
| `commit.ts` | Stages material paths, writes a structured change log, and creates a git commit. | `state/change-log/**`, git commit |

Production V1 gaps relative to the target architecture:

- workflows should remain manually run until the VM, WebDAV behavior, and approval path are validated
- the LLM ingest planner proposes richer wiki mutations, but human approval is still required before those changes are applied
- scheduled maintenance and raw file watching are intentionally left inactive for the first production cut

## Code Documentation

Detailed English documentation for every script and shared library module lives in [`docs/code-reference.md`](docs/code-reference.md).

The production V1 runbook lives in [`docs/production-runbook.md`](docs/production-runbook.md).

Docker Compose deployments can build the n8n runtime from [`Dockerfile`](Dockerfile), which installs n8n, includes `git`, and bakes the compiled local scripts into `/app` for the workflow command nodes.

## Docker Compose Example

This example uses the published GHCR images for n8n plus the external runner. It mounts `./local-files` both at `/files` for normal n8n local files and at `/data/vault` for the repository workflows, because the workflow command nodes use `/data/vault`.

Copy [`.env.sample`](.env.sample) to `.env` and fill the secrets before starting the stack.

```yaml
version: "3.3"

services:
  n8n:
    image: ghcr.io/davidpoza/dps-wiki-llm:latest
    restart: always
    ports:
      - "5678:5678"
    environment:
      - N8N_BASIC_AUTH_ACTIVE=true
      - N8N_BASIC_AUTH_USER=${N8N_BASIC_AUTH_USER}
      - N8N_BASIC_AUTH_PASSWORD=${N8N_BASIC_AUTH_PASSWORD}

      - DB_TYPE=postgresdb
      - DB_POSTGRESDB_HOST=db
      - DB_POSTGRESDB_PORT=5432
      - DB_POSTGRESDB_DATABASE=${POSTGRES_DB}
      - DB_POSTGRESDB_USER=${POSTGRES_NON_ROOT_USER}
      - DB_POSTGRESDB_PASSWORD=${POSTGRES_NON_ROOT_PASSWORD}

      - N8N_RUNNERS_ENABLED=true
      - N8N_RUNNERS_MODE=external
      - N8N_RUNNERS_AUTH_TOKEN=${RUNNERS_AUTH_TOKEN}
      - N8N_RUNNERS_BROKER_LISTEN_ADDRESS=0.0.0.0

      - N8N_ENFORCE_SETTINGS_FILE_PERMISSIONS=true
      - N8N_HOST=${DOMAIN_NAME}
      - N8N_PORT=5678
      - N8N_PROTOCOL=https
      - NODE_ENV=production
      - WEBHOOK_URL=https://${DOMAIN_NAME}/
      - GENERIC_TIMEZONE=${GENERIC_TIMEZONE}
      - TZ=${GENERIC_TIMEZONE}

      - NODE_FUNCTION_ALLOW_EXTERNAL=axios,qs
      - NODES_EXCLUDE=[]

      - OPENROUTER_API_KEY=${OPENROUTER_API_KEY}
      - OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
      - OPENROUTER_MODEL=${OPENROUTER_MODEL}
      - OPENROUTER_SITE_URL=${OPENROUTER_SITE_URL}
      - OPENROUTER_ANSWER_TEMPERATURE=0.2

      - GIT_AUTHOR_NAME=${GIT_AUTHOR_NAME}
      - GIT_AUTHOR_EMAIL=${GIT_AUTHOR_EMAIL}
      - GIT_COMMITTER_NAME=${GIT_COMMITTER_NAME}
      - GIT_COMMITTER_EMAIL=${GIT_COMMITTER_EMAIL}
    depends_on:
      - db
    volumes:
      - ./n8n_data:/home/node/.n8n
      - ./local-files:/files
      - ./local-files:/data/vault

  n8n-runner:
    image: ghcr.io/davidpoza/dps-wiki-llm-runner:latest
    restart: always
    environment:
      - N8N_RUNNERS_AUTH_TOKEN=${RUNNERS_AUTH_TOKEN}
      - N8N_RUNNERS_TASK_BROKER_URI=http://n8n:5679
      - OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
      - OPENROUTER_MODEL=${OPENROUTER_MODEL}
      - OPENROUTER_SITE_URL=${OPENROUTER_SITE_URL}
      - OPENROUTER_ANSWER_TEMPERATURE=0.2

      - GIT_AUTHOR_NAME=${GIT_AUTHOR_NAME}
      - GIT_AUTHOR_EMAIL=${GIT_AUTHOR_EMAIL}
      - GIT_COMMITTER_NAME=${GIT_COMMITTER_NAME}
      - GIT_COMMITTER_EMAIL=${GIT_COMMITTER_EMAIL}
    depends_on:
      - n8n
    volumes:
      - ./local-files:/data/vault

  db:
    image: postgres:16
    restart: always
    environment:
      - POSTGRES_USER
      - POSTGRES_PASSWORD
      - POSTGRES_DB
      - POSTGRES_NON_ROOT_USER
      - POSTGRES_NON_ROOT_PASSWORD
    volumes:
      - ./db-data:/var/lib/postgresql/data
      - ./init-data.sh:/docker-entrypoint-initdb.d/init-data.sh
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -h localhost -U ${POSTGRES_USER} -d ${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 10
```

## Repository Structure

```text
.
├── README.md
├── package.json
├── tsconfig.json
├── docs/
│   ├── code-reference.md
│   ├── assets/
│   │   └── logo.svg
│   └── diagrams/
│       ├── workflow.puml
│       └── workflow.svg
└── tools/
    ├── init-db.ts
    ├── ingest-source.ts
    ├── plan-source-note.ts
    ├── apply-update.ts
    ├── answer-context.ts
    ├── answer-record.ts
    ├── feedback-record.ts
    ├── reindex.ts
    ├── search.ts
    ├── lint.ts
    ├── health-check.ts
    ├── commit.ts
    ├── config.ts
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

The diagram below summarizes the intended workflow. Green nodes are scripts available in this repo; yellow nodes are external orchestration or provider-specific LLM components.

Rendered using the official PlantUML web service:

![Workflow dps-wiki-llm](docs/diagrams/workflow.svg)

Canonical source: [`docs/diagrams/workflow.puml`](docs/diagrams/workflow.puml)  
Versioned render: [`docs/diagrams/workflow.svg`](docs/diagrams/workflow.svg)

## Typical Usage

Requirements:

- Node.js `>=22.5.0`, for built-in `node:sqlite` support
- dependencies installed with `npm install`
- Git identity configured if you plan to use `commit.ts`; either set `user.name` and `user.email`, or provide `GIT_AUTHOR_NAME`/`GIT_AUTHOR_EMAIL` or `GIT_COMMITTER_NAME`/`GIT_COMMITTER_EMAIL` in the runtime environment

The tools are TypeScript source files compiled to `dist/` and executed from the generated JavaScript in the package scripts. `npm install` runs the build through `prepare`; run `npm run build` again after changing source. Use `--silent` when command output must remain parseable JSON for automation.

Check the TypeScript build:

```bash
npm run typecheck
```

Run the test suite:

```bash
npm test
npm run test:coverage
```

Initialize the database:

```bash
npm run --silent init-db -- --vault /path/to/vault
```

Apply a mutation plan:

```bash
npm run --silent apply-update -- --vault /path/to/vault --input ./plan.json
```

Normalize a raw source and create the baseline source-note plan:

```bash
npm run --silent ingest-source -- --vault /path/to/vault --input ./raw-event.json
npm run --silent plan-source-note -- --vault /path/to/vault --input ./source-payload.json
```

Rebuild the search index:

```bash
npm run --silent reindex -- --vault /path/to/vault
```

Run a search query:

```bash
npm run --silent search -- --vault /path/to/vault "model context protocol" --limit 5
```

Build answer context and persist an answer artifact after LLM synthesis:

```bash
npm run --silent answer-context -- --vault /path/to/vault --input ./answer-context-input.json
npm run --silent answer-record -- --vault /path/to/vault --input ./answer-record-input.json
```

Record feedback:

```bash
npm run --silent feedback-record -- --vault /path/to/vault --input ./feedback.json
```

Run the production V1 n8n flow manually:

1. Import the workflows from `n8n/workflows/`.
2. Set `OPENROUTER_API_KEY` in the n8n runtime and optionally set `OPENROUTER_MODEL`.
3. Run `KB - Reindex Wiki`.
4. Run `KB - Answer OpenRouter Manual` or `KB - Ingest Raw OpenRouter Manual`.
5. Review any proposed feedback or LLM mutation plan.
6. Run `KB - Apply Feedback` with `approved=true` only after review.

Run maintenance checks without writing reports:

```bash
npm run --silent lint -- --vault /path/to/vault --no-write
npm run --silent health-check -- --vault /path/to/vault --no-write
```

Create a structured commit:

```bash
npm run --silent commit -- --vault /path/to/vault --input ./commit.json
```

## CLI Conventions

- `--vault` is the root of the target vault and defaults to the current working directory.
- `--input` is used by JSON-driven scripts such as `ingest-source.ts`, `plan-source-note.ts`, `apply-update.ts`, `answer-context.ts`, `answer-record.ts`, `feedback-record.ts`, and `commit.ts`.
- `--db` can override the database path for `init-db.ts`, `reindex.ts`, and `search.ts`.
- `--limit` controls result count in `search.ts`.
- `--no-write` is supported by `feedback-record.ts`, `lint.ts`, and `health-check.ts`.
- Scripts emit machine-readable JSON on success.

## Configuration

`tools/config.ts` is the central behavior configuration for the toolchain. It defines vault paths, ingest defaults, answer artifact defaults, search limits, SQLite schema and pragmas, valid mutation and feedback values, note lint thresholds, health-check thresholds, markdown section behavior, and report directories.

The canonical JSON payload contracts from `AGENTS.md` are represented as TypeScript interfaces in `tools/lib/contracts.ts`.

## Operational Notes

- `apply-update.ts` enforces `create`, `update`, and `noop` actions and tracks idempotency keys in `state/runtime/idempotency-keys.json`.
- `ingest-source.ts` accepts only `raw/**` paths and emits a normalized source payload.
- `plan-source-note.ts` is a deterministic baseline planner; the OpenRouter ingest workflow proposes richer wiki propagation separately for review.
- `reindex.ts` indexes markdown derived from `wiki/`, not `raw/`.
- `search.ts` queries the FTS index and returns ranked results with `path`, `title`, `doc_type`, and `score`.
- `answer-context.ts` reads retrieved wiki markdown for LLM context; the OpenRouter answer workflow stores the answer under `outputs/` with `answer-record.ts` and returns feedback for review.
- `lint.ts` focuses on structure and maintainability.
- `health-check.ts` focuses on unsupported claims, stale low-confidence notes, and missing pages.
- `commit.ts` writes a change log to `state/change-log/` before creating the git commit.
- `docs/code-reference.md` is the file-level reference for the entire codebase.
