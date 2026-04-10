<div align="center">
  <img src="docs/assets/logo.svg" alt="dps-wiki-llm logo" width="132">
  <h1>dps-wiki-llm</h1>
  <p><strong>Deterministic Node.js tooling for maintaining a persistent markdown-based wiki.</strong></p>
  <p><code>raw/</code> for events, <code>wiki/</code> for derived knowledge, <code>state/</code> for indexes, and <code>outputs/</code> for artifacts.</p>
</div>

## Overview

`dps-wiki-llm` implements the operational core of a persistent knowledge system built around the model `raw -> wiki -> state -> outputs`. The goal is not to behave like a chat system with improvised memory, but to maintain reusable, traceable notes that evolve through explicit rules.

The current repository contains the base tooling for applying mutation plans and recording auditable feedback. The vault itself lives outside this repo, or is mounted locally; this repo hosts the scripts that operate on that vault.

## Principles

- Strict separation between `raw/` and `wiki/`.
- Reactive ingestion only on `raw/**`.
- Small, deterministic, idempotent mutations.
- JSON as the canonical contract between orchestration and scripts.
- Markdown as the durable state layer and SQLite FTS as the retrieval layer.
- Propagation from generated outputs is conditional and always auditable.

## Current Status

Scripts currently available:

- `tools/apply-update.mjs`: consumes a Mutation Plan JSON object, creates or updates markdown notes, and records idempotency keys in `state/runtime/idempotency-keys.json`.
- `tools/feedback-record.mjs`: normalizes a Feedback Record, writes artifacts into `state/feedback/`, and can derive a mutation plan when the decision is `propagate`.
- `tools/lib/*.mjs`: internal utilities for CLI handling, filesystem access, frontmatter parsing, and markdown composition.

Components described by the architecture but not yet implemented here:

- `init-db.mjs`
- `ingest-source.mjs`
- `reindex.mjs`
- `search.mjs`
- `lint.mjs`
- `health-check.mjs`
- `commit.mjs`

## Repository Structure

```text
.
├── README.md
├── package.json
├── docs/
│   ├── assets/
│   │   └── logo.svg
│   └── diagrams/
│       ├── workflow.puml
│       └── workflow.svg
└── tools/
    ├── apply-update.mjs
    ├── feedback-record.mjs
    └── lib/
```

Vault layout expected by the architecture:

```text
vault/
├── raw/
├── wiki/
├── state/
└── outputs/
```

## Target Workflow

The following diagram summarizes the intended system workflow. Green nodes are scripts already present in this repo; yellow nodes are planned architecture components that are still pending.

Rendered using the official PlantUML web service:

![Workflow dps-wiki-llm](docs/diagrams/workflow.svg)

Canonical source: [`docs/diagrams/workflow.puml`](docs/diagrams/workflow.puml)  
Versioned render: [`docs/diagrams/workflow.svg`](docs/diagrams/workflow.svg)

## Quick Start

Requirements:

- Node.js 20 or newer

Run a mutation plan:

```bash
npm run apply-update -- --vault /path/to/vault --input ./plan.json
```

Record a feedback decision:

```bash
npm run feedback-record -- --vault /path/to/vault --input ./feedback.json
```

Both scripts:

- accept JSON via `--input` or `stdin`
- return machine-readable JSON
- resolve paths inside the vault root to prevent writes outside the vault

## Operational Contracts

- `apply-update.mjs` expects the `Mutation Plan` contract.
- `feedback-record.mjs` expects the `Feedback Record` contract.
- If the decision is `propagate`, `feedback-record.mjs` generates a mutation plan that can be reused by `apply-update.mjs`.

## Critical Rule

Never trigger automations on `wiki/**`. The correct boundary is:

```text
raw/  = reactive event stream
wiki/ = stable derived state
```

Breaking that separation introduces loops, noise, and non-deterministic updates.
