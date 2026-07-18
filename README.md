<div align="center">
  <img src="docs/assets/logo.png" alt="dps-wiki-llm logo" width="132">
  <h1>dps-wiki-llm</h1>
  <p><strong>A Spring Boot + Angular knowledge pipeline with semantic retrieval, guided ingestion, vault editing, and Telegram integration.</strong></p>
</div>

## Overview

`dps-wiki-llm` is a self-hosted knowledge system that ingests markdown documents and web links, applies LLM-guided updates to a vault, and answers questions using semantic retrieval over a PostgreSQL/pgvector index.

**Stack:** Spring Boot 3.3 (Java 21), Angular 21 (PrimeNG), PostgreSQL 17 + pgvector, RabbitMQ, TEI embeddings sidecar (multilingual-e5-small), Telegram long-polling bot.

## Storage Layers

```text
vault/
├── raw/              ← incoming content (inbox/, bookmarks/, voice/, web/)
├── wiki/             ← curated knowledge state
│   ├── sources/      ← source notes (auto-created)
│   ├── concepts/     ← concept notes
│   ├── entities/     ← entity notes
│   ├── topics/       ← topic notes (manual creation only)
│   ├── analyses/     ← durable syntheses
│   └── indexes/      ← derived wiki index pages
├── state/            ← idempotency ledger and change logs
└── outputs/          ← answer artifacts
```

## Quick Start

```bash
# Copy and configure
cp .env.sample .env
# Edit .env with your LLM endpoint, JWT secret, admin password,
# and optional Telegram token

# Start all services
docker compose up --build

# API is available at http://localhost:8080/api
# Frontend is available at http://localhost:8080
# OpenAPI UI at http://localhost:8080/api/swagger-ui.html
# Actuator health at http://localhost:8080/api/actuator/health
```

Most API endpoints require a JWT from `POST /api/auth/login`. Health and OpenAPI endpoints are public.

## Development

To run the backend locally (with the infrastructure services already up via `docker compose up -d postgres rabbitmq embeddings web-extractor`):

```bash
cd backend
mvn spring-boot:run -Dspring-boot.run.jvmArguments="-Dspring.docker.compose.enabled=false -Dspring.profiles.active=local"
```

The `local` profile (`application-local.yml`) sets `server.port=8090` and points datasource/rabbitmq to `172.17.0.1` so the app doesn't conflict with the containerised stack. Without this profile the app starts on port 8080 (production default).

## Architecture

### Services (docker-compose)

| Service | Port | Description |
|---------|-----------------|-------------|
| `postgres` | 5432 internal | PostgreSQL 17 with pgvector + pg_trgm |
| `rabbitmq` | 5672 internal, 15672 exposed | RabbitMQ 3.13 with management UI |
| `embeddings` | 8080 (internal) | TEI sidecar serving `multilingual-e5-small` (384 dims) |
| `web-extractor` | 3000 (internal) | Node + Playwright microservice: renders URLs in a real browser and returns structured markdown + metadata |
| `backend` | 8080 (internal) | Spring Boot API mounted at `/api` |
| `frontend` | 80 (internal) | nginx serving the built Angular app |
| `proxy` | 8080 | nginx: `/` → frontend, `/api/**` → backend |

### Job Queues

Two RabbitMQ queues with dead-letter routing:
- **`wiki-write-jobs`** — single consumer (`prefetch=1`), serializes all vault mutations: INGEST and REVERT jobs
- **`answer-jobs`** — handles ANSWER jobs (read-only). The current listener factory also uses `prefetch=1` and one consumer.

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
2. Normalize source → LLM cleaning → baseline source note applied to `wiki/sources/`
3. Reindex `wiki/**` into PostgreSQL and incrementally refresh pgvector embeddings
4. Connection discovery: LLM-proposed links + semantic neighbors (pgvector cosine)
5. **Unattended mode**: accept discovered candidates, apply targeted wiki updates, commit once
6. **Validated mode**: commit the baseline source note, pause for guided review, then apply accepted/manual links in a follow-up commit

### Answer Flow

1. Submit question → ANSWER job enqueued
2. Semantic retrieval: embed question through the TEI sidecar, top-k cosine search over the pgvector HNSW index
3. LLM synthesis over bounded context packet
4. Answer artifact written to `outputs/answer-<jobId>.md`
5. SSE streams progress events throughout

### Job Revert

Every state-mutating job groups its file changes under a snapshot (`snapshots` / `snapshot_files`, each row holding `content_before`/`content_after`). Revert restores the captured `content_before` for the job's files and applies compensating DB changes. Conflicts (later jobs touching the same files) are detected and reported without overwriting.

### Vault Replication (WebDAV)

The vault lives in a Docker volume, but when `WEBDAV_URL` is set every local write is also **replicated to an external WebDAV repository** (via the Sardine client):

- **Push on save (synchronous, per file):** creating, editing, deleting, renaming, or moving a vault file writes locally, records the change in history, then pushes *that single file* to WebDAV. If the push fails, the local write and history entry are kept, the file is flagged not-replicated, and the API returns `502` so the UI can show "saved locally, not replicated." The next successful save (or Sync) re-pushes.
- **Sync button (pull + reconcile):** `POST /api/webdav/sync` fetches the remote state and, per file, compares the local hash, the remote content, and the last-synced baseline (`vault_file_sync`). Remote-only changes are applied and recorded as `WEBDAV_PULL` history entries; local-only changes are left alone; files changed on **both** sides become **conflicts** (neither side overwritten).
- **Conflict resolution:** unresolved conflicts are listed by `GET /api/webdav/conflicts` and shown side-by-side in the UI. `POST /api/webdav/conflicts/resolve` with `{ path, keep: "LOCAL" | "REMOTE" }` keeps the chosen version (push local, or write remote + record a `WEBDAV_PULL` entry) and clears the conflict.

When `WEBDAV_URL` is blank, replication is disabled, local editing works unchanged, and the Sync endpoint reports "not configured" (`409`).

### Change History & Versions

History is a **flat, per-file change stream** (no commit grouping). Each entry records the file `path`, `+/-` line stats, a `createdAt`, a `changeId` for its diff, and a `source` (`LOCAL_EDIT`, `JOB`, or `WEBDAV_PULL`):

- `GET /api/history` — reverse-chronological per-file entries; `GET /api/history/{changeId}/diff` — unified diff for one entry.
- The editor's **Versions** control lists prior versions of the open file (`GET /api/files/versions`), previews any version with a diff against the current content (`GET /api/files/version`), and can **restore** one by saving it through the normal save path (which also replicates it to WebDAV).

### SSE Progress

Subscribe to `GET /api/jobs/events` (Server-Sent Events) for real-time job status. Events include phase transitions (`QUEUED → STARTED → PROGRESS → AWAITING_REVIEW → COMPLETED/FAILED`) and per-file traversal events (`create`/`update`/`read`).

## Environment Variables

See `.env.sample` for all required variables. Key ones:

| Variable | Default | Description |
|----------|---------|-------------|
| `SPRING_DATASOURCE_URL` | — | PostgreSQL JDBC URL |
| `LLM_BASE_URL` | — | OpenAI-compatible API base URL |
| `LLM_MODEL` | — | Model name |
| `EMBED_BASE_URL` | `http://embeddings:8080` | TEI sidecar URL |
| `EMBED_MODEL` | `multilingual-e5-small` | Embedding model name stored with pgvector rows |
| `EMBED_DIMENSION` | `384` | Embedding dimension (must match pgvector column) |
| `EXTRACTOR_BASE_URL` | `http://web-extractor:3000` | Browser extraction service URL |
| `JWT_SECRET` | — | Base64 JWT signing secret; set this explicitly |
| `ADMIN_USERNAME` | `admin` | Initial admin username |
| `ADMIN_PASSWORD` | — | Initial admin password; set this explicitly |
| `TELEGRAM_BOT_TOKEN` | — | Telegram token (optional; bot disabled if empty) |
| `TELEGRAM_ALLOWED_CHAT_ID` | — | Only this chat ID is processed |
| `VAULT_PATH` | `/vault` | Absolute path to vault directory |
| `CORS_ALLOWED_ORIGINS` | — | Comma-separated allowed origins |
| `WEBDAV_URL` | _(blank)_ | WebDAV endpoint for off-box vault replication. **Leave blank to disable** replication (local editing keeps working) |
| `WEBDAV_USERNAME` | _(blank)_ | WebDAV username |
| `WEBDAV_PASSWORD` | _(blank)_ | WebDAV password |

## Telegram Bot

When `TELEGRAM_BOT_TOKEN` is configured, the bot uses long polling (no inbound webhook needed):

- `/ask <question>` or plain text → enqueue answer job, reply when done
- `/ingest <url>` → fetch URL into `raw/web/`, enqueue ingest job, reply when done
- Messages from any chat ID other than `TELEGRAM_ALLOWED_CHAT_ID` are ignored

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/auth/login` | Login and receive JWT, or a 2FA challenge |
| `POST` | `/api/auth/login/2fa` | Complete a 2FA login challenge |
| `GET` | `/api/auth/me` | Current authenticated user |
| `GET` | `/api/auth/login-history` | Login history for the current user |
| `POST` | `/api/auth/password` | Change password |
| `POST` | `/api/auth/2fa/setup` | Create a TOTP setup secret |
| `POST` | `/api/auth/2fa/confirm` | Enable TOTP after code confirmation |
| `POST` | `/api/auth/2fa/disable` | Disable TOTP |
| `POST` | `/api/auth/register` | Create a user (admin only) |
| `GET` | `/api/platform` | Health/status |
| `GET` | `/api/jobs/events` | SSE stream |
| `GET` | `/api/jobs` | Latest jobs |
| `GET` | `/api/jobs/{id}` | Job status |
| `DELETE` | `/api/jobs/{id}` | Cancel a queued/running job |
| `POST` | `/api/ingest` | Enqueue URL ingest |
| `POST` | `/api/ingest/upload` | Upload markdown |
| `POST` | `/api/answer` | Enqueue answer job |
| `POST` | `/api/jobs/{id}/revert` | Enqueue revert |
| `GET` | `/api/jobs/{id}/review` | Get connection candidates |
| `POST` | `/api/jobs/{id}/review` | Submit review decisions |
| `GET` | `/api/files/tree` | Vault file tree |
| `GET` | `/api/files/content?path=` | Read a vault file |
| `PUT` | `/api/files/content?path=` | Save a vault file |
| `POST` | `/api/files/content?path=` | Create a vault file |
| `DELETE` | `/api/files/content?path=` | Delete a vault file |
| `POST` | `/api/files/rename` | Rename a vault file |
| `POST` | `/api/files/move` | Move a vault file |
| `POST` | `/api/files/directory` | Create a vault directory |
| `GET` | `/api/files/lookup?q=` | Lexical file search |
| `GET` | `/api/files/versions?path=` | Prior versions of a file (newest first) |
| `GET` | `/api/files/version?path=&versionId=` | Content of a specific prior version |
| `GET` | `/api/history` | Per-file change history (flat, newest first) |
| `GET` | `/api/history/{changeId}/diff` | Unified diff for one change entry |
| `POST` | `/api/webdav/sync` | Pull + reconcile remote changes; returns `{pulled, deleted, conflicts}` |
| `GET` | `/api/webdav/conflicts` | Unresolved sync conflicts (local + remote content) |
| `POST` | `/api/webdav/conflicts/resolve` | Resolve a conflict `{ path, keep: LOCAL\|REMOTE }` |
| `GET` | `/api/settings/prompts` | List editable LLM prompts |
| `GET` | `/api/settings/prompts/{key}` | Read one prompt |
| `PUT` | `/api/settings/prompts/{key}` | Update one prompt |

Full OpenAPI UI is available at `/api/swagger-ui.html` when running.
