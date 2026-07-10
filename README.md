<div align="center">
  <img src="docs/assets/logo.png" alt="dps-wiki-llm logo" width="132">
  <h1>dps-wiki-llm</h1>
  <p><strong>A Spring Boot + Angular knowledge pipeline with semantic retrieval, guided ingestion, and Telegram integration.</strong></p>
</div>

## Overview

`dps-wiki-llm` is a self-hosted knowledge system that ingests markdown documents and web links, applies LLM-guided updates to a vault, and answers questions using semantic retrieval over a pgvector index.

**Stack:** Spring Boot 3.3 (Java 21), Angular 21 (PrimeNG), PostgreSQL 17 + pgvector, RabbitMQ, TEI embeddings sidecar (multilingual-e5-small), Telegram long-polling bot.

## Storage Layers

```text
vault/
├── raw/         ← incoming content (inbox/, web/)
├── wiki/        ← curated knowledge state
│   ├── sources/     ← source notes (auto-created)
│   ├── concepts/    ← concept notes
│   ├── entities/    ← entity notes
│   ├── topics/      ← topic notes (manual creation only)
│   └── ...
├── state/       ← change logs and runtime metadata
└── outputs/     ← answer artifacts
```

## Quick Start

```bash
# Copy and configure
cp .env.sample .env
# Edit .env with your LLM endpoint and optional Telegram token

# Start all services
docker compose up --build

# API is available at http://localhost:8080/api
# Frontend is available at http://localhost:8080
# OpenAPI UI at http://localhost:8080/swagger-ui.html
# Actuator health at http://localhost:8080/actuator/health
```

## Architecture

### Services (docker-compose)

| Service | Port (internal) | Description |
|---------|-----------------|-------------|
| `postgres` | 5432 | PostgreSQL 17 with pgvector + pg_trgm |
| `rabbitmq` | 5672 / 15672 | RabbitMQ 3.13 with management UI |
| `embeddings` | 8080 (internal) | TEI sidecar serving `multilingual-e5-small` (384 dims) |
| `web-extractor` | 3000 (internal) | Node + Playwright microservice: renders URLs in a real browser and returns structured markdown + metadata |
| `backend` | 8081 (internal) | Spring Boot API |
| `frontend` | 4200 (internal) | Angular dev server |
| `proxy` | 8080 | nginx: `/` → frontend, `/api/**` → backend |

### Job Queues

Two RabbitMQ queues with dead-letter routing:
- **`wiki-write-jobs`** — single consumer (`prefetch=1`), serializes all vault mutations: INGEST and REVERT jobs
- **`answer-jobs`** — handles ANSWER jobs (read-only, parallel-safe)

### Web Extraction

Submitting a URL routes through the `web-extractor` microservice (`POST /extract`),
which **always loads the page in a real Chromium browser** (realistic user-agent,
JS-rendered DOM) so it handles SPAs and sites that block non-browser clients. It
isolates the main article (Readability), converts it to Markdown (Turndown + GFM),
absolutizes links/images, and returns metadata. The backend writes the result to
`raw/web/**` with YAML frontmatter:

```markdown
---
source_url: "https://example.com/final"
canonical_url: "https://example.com/canonical"
title: "Article title"
author: "…"
published: "2026-01-15"
site: "Example"
lang: "es"
extraction_confidence: "high"   # "low" when it falls back to whole-body
---

# Article title

…structured markdown…
```

`SourceNormalizer` reads this frontmatter (canonical URL, title, metadata), with a
legacy `Source URL:` line fallback for pre-migration files. A `POST /render` debug
endpoint returns the raw rendered HTML for troubleshooting.

### Ingestion Flow

1. Upload markdown or submit URL → `raw/inbox/` or `raw/web/`
2. Normalize source → LLM cleaning → baseline source note committed to `wiki/sources/`
3. Connection discovery: LLM-proposed links + semantic neighbors (pgvector cosine)
4. **Unattended mode**: auto-apply safe connections → commit
5. **Validated mode**: pause for guided review UI → accept/reject + manual file picker → commit

### Answer Flow

1. Submit question → ANSWER job enqueued
2. Semantic retrieval: embed question, top-k cosine search over HNSW index
3. LLM synthesis over bounded context packet
4. Answer artifact written to `outputs/answer-<jobId>.md`
5. SSE streams progress events throughout

### Job Revert

Every state-mutating job captures `pre_git_sha` and `commit_range`. Revert issues a `git revert` of the commit range + compensating DB changes. Conflicts (later jobs touching the same files) are detected and reported without overwriting.

### SSE Progress

Subscribe to `GET /api/jobs/events` (Server-Sent Events) for real-time job status. Events include phase transitions (`QUEUED → STARTED → PROGRESS → COMPLETED/FAILED`) and per-file traversal events (`create`/`update`/`read`).

## Environment Variables

See `.env.sample` for all required variables. Key ones:

| Variable | Default | Description |
|----------|---------|-------------|
| `SPRING_DATASOURCE_URL` | — | PostgreSQL JDBC URL |
| `LLM_BASE_URL` | — | OpenAI-compatible API base URL |
| `LLM_MODEL` | — | Model name |
| `EMBED_BASE_URL` | `http://embeddings:8080` | TEI sidecar URL |
| `EMBED_DIMENSION` | `384` | Embedding dimension (must match pgvector column) |
| `TELEGRAM_BOT_TOKEN` | — | Telegram token (optional; bot disabled if empty) |
| `TELEGRAM_ALLOWED_CHAT_ID` | — | Only this chat ID is processed |
| `VAULT_PATH` | `/vault` | Absolute path to vault directory |
| `CORS_ALLOWED_ORIGINS` | — | Comma-separated allowed origins |

## Telegram Bot

When `TELEGRAM_BOT_TOKEN` is configured, the bot uses long polling (no inbound webhook needed):

- `/ask <question>` or plain text → enqueue answer job, reply when done
- `/ingest <url>` → fetch URL into `raw/web/`, enqueue ingest job, reply when done
- Messages from any chat ID other than `TELEGRAM_ALLOWED_CHAT_ID` are ignored

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/platform` | Health/status |
| `GET` | `/api/jobs/events` | SSE stream |
| `GET` | `/api/jobs/{id}` | Job status |
| `POST` | `/api/ingest` | Enqueue URL ingest |
| `POST` | `/api/ingest/upload` | Upload markdown |
| `POST` | `/api/answer` | Enqueue answer job |
| `POST` | `/api/jobs/{id}/revert` | Enqueue revert |
| `GET` | `/api/jobs/{id}/review` | Get connection candidates |
| `POST` | `/api/jobs/{id}/review` | Submit review decisions |
| `GET` | `/api/files/lookup?q=` | Lexical file search |

Full OpenAPI spec available at `/swagger-ui.html` when running.
