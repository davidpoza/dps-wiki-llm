<div align="center">
  <img src="docs/assets/logo.png" alt="dps-wiki-llm logo" width="132">
  <h1>dps-wiki-llm</h1>
  <p><strong>Deterministic Node.js tooling for a persistent markdown-based knowledge system.</strong></p>
</div>

## Overview

`dps-wiki-llm` is the local tooling layer of a `raw → wiki → state → outputs` knowledge workflow. It applies controlled markdown updates to a vault, maintains SQLite FTS and local vector indexes, generates maintenance reports, and records feedback with git-backed change logs.

The repository is not the orchestration layer. `n8n`, LLM planning, and answer synthesis sit around these scripts, not inside them.

## Storage Layers

```text
vault/
├── raw/         ← reactive event stream (ingest triggers here)
├── wiki/        ← curated, derived knowledge state
├── state/       ← indexes, logs, and metadata
│   ├── kb.db               ← SQLite FTS index
│   └── semantic/           ← vector index (gitignored)
└── outputs/     ← ephemeral answer artifacts
```

Breaking the `raw/` versus `wiki/` boundary creates loops, noisy state, and non-deterministic behavior. **Only trigger on `raw/**`. Never trigger on `wiki/**`.**

## Quick Start

Requirements: Node.js `>=22.5.0`, `npm install` (runs build via `prepare`).

```bash
# Build
npm run build

# Type-check
npm run typecheck

# Test
npm test

# Initialize a vault
npm run --silent init-db -- --vault /path/to/vault
npm run --silent reindex -- --vault /path/to/vault
npm run --silent embed-index -- --vault /path/to/vault
```

## Workflow

![Workflow dps-wiki-llm](docs/diagrams/workflow.svg)

Canonical source: [`docs/diagrams/workflow.puml`](docs/diagrams/workflow.puml)

## Documentation

| Document | Audience | Contents |
|----------|----------|----------|
| [`docs/architecture.md`](docs/architecture.md) | Engineers | Entry points, contracts, indexing model, CLI conventions, environment variables |
| [`docs/production-runbook.md`](docs/production-runbook.md) | Operators | Docker Compose, LLM config, n8n workflows, initial bootstrap, Telegram |
| [`AGENTS.md`](AGENTS.md) | AI agents | System intent, boundaries, knowledge model, templates, design principles |

## Repository Structure

```text
tools/
├── <tool>.ts               ← CLI entry points (n8n calls node dist/tools/<tool>.js)
├── config.ts               ← central behavior configuration
├── services/               ← LLM prompt builders and event normalizers
└── lib/                    ← shared utilities (db, fs, llm, markdown, text, …)
```

See [`docs/architecture.md`](docs/architecture.md) for per-module details.
