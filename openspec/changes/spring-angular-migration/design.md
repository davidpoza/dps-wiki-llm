## Context

`dps-wiki-llm` is today a deterministic Node.js/TypeScript CLI toolchain (`tools/**`) orchestrated by self-hosted **n8n**, over a git-backed markdown vault (`raw → wiki → state → outputs`). Retrieval is split across SQLite FTS5 (`state/kb.db`) and a local ONNX vector index (`state/semantic/`, `@xenova/transformers`); LLM calls go through `tools/lib/llm.ts` against an OpenAI-compatible API; a Telegram bot runs as an n8n polling workflow. The behavioral contracts (normalized source payload, mutation plan, answer record, feedback record; idempotency keys; topic-creation guard; hybrid fusion `0.6·sem + 0.4·lex`; per-operation git commits) are documented in `AGENTS.md` and `docs/architecture.md` and are the source of truth to preserve.

The target stack mirrors the sibling project `../dog-booking-planner`: **Spring Boot 3.3.x / Java 21 (Maven), PostgreSQL 17, Angular 21 (signals) + PrimeNG (pnpm), RabbitMQ 3.13, all behind an nginx reverse proxy in Docker Compose**. That project already contains a clean, working RabbitMQ + SSE progress pattern (`SolverQueueService`, `SolverRabbitConsumer`, `SolverSseController`, `RabbitConfig` with `prefetch=1`) and nginx SSE config (`proxy_buffering off`) that we port almost verbatim.

This is the **foundational** change: scaffold + the two core flows (ingest, answer). Feedback propagation, maintenance (lint/health-check), YouTube/PDF extraction, term-topic-resolution and concept-dedup re-implementation, and the full frontend feature set are deferred to later changes.

## Goals / Non-Goals

**Goals:**
- Stand up the full Dockerized Spring Boot + Angular + PostgreSQL(+pgvector) + RabbitMQ + nginx stack, replacing n8n as the orchestrator.
- Preserve the git-backed markdown vault and the hard `raw/` → `wiki/` boundary unchanged; the backend mounts the vault volume and only `raw/**` triggers ingest.
- Retrieval is **embeddings-only** via pgvector nearest-neighbor search (local `multilingual-e5-small` vectors); the lexical/FTS leg and `0.6/0.4` hybrid fusion are dropped.
- Route all long-running work through durable RabbitMQ queues with a **serialized write consumer** and stream progress over SSE.
- Perform chat + embeddings through **Spring AI** against an OpenAI-compatible endpoint (provider-switchable).
- Re-host the Telegram bot in the backend.
- Faithfully port the ingest and answer pipelines, keeping their JSON contracts, idempotency, guardrails, and git provenance.
- Ship a **responsive PrimeNG frontend**: job viewer (phases + per-file traversal + errors), chat over the KB, multi-format ingest (markdown + links), guided connection-review, and job revert.
- **Guided ingestion**: discover connections (LLM-proposed + semantic neighbors) and either auto-apply (`unattended`) or pause for human review (`validated`) with accept/reject + a manual `pg_trgm` file picker, applying accepted connections directly to the knowledge files.
- **Job revert** across git and the database, with conflict detection.

**Non-Goals:**
- Migrating the wiki content out of markdown/git into relational rows (explicitly kept in git).
- **PDF and YouTube extraction** (markdown + link ingestion are in scope), answer-side feedback propagation, maintenance flows, term-topic-resolution, and concept-dedup (later changes).
- Multi-user auth beyond a JWT-ready security scaffold; single-user operation is assumed.
- Kafka / high-throughput event streaming (evaluated and rejected — see Decisions).

## Decisions

### D1 — Job queue: RabbitMQ with a serialized write consumer
Use durable RabbitMQ queues. Writes (ingest) go to a `wiki-write-jobs` queue processed by a **single sequential consumer** (`concurrentConsumers=1`, `maxConcurrentConsumers=1`, `prefetch=1`); reads (answer) go to a separate `answer-jobs` queue that may run concurrently. A dead-letter queue captures jobs that exhaust retries.
- **Why:** the `raw → wiki` model is deterministic and every write does a git commit over shared state, so write serialization is a hard requirement — the natural RabbitMQ pattern, already proven in `dog-booking-planner`. Native Spring AMQP, per-message ack/nack/DLQ, and a management UI.
- **Alternatives:** *Postgres `SKIP LOCKED`* (one fewer container, transactional job state — viable, but we would hand-build the worker loop, heartbeat, and DLQ that Rabbit gives us). *Kafka* (rejected: overkill for a single-user, low-frequency, sequential-write workload; no native work-queue semantics; heavy ops). *Redis* (rejected: adds infra without a clear win here).

### D2 — Wiki content stays git-backed markdown; Postgres holds indexes/jobs/state
The backend mounts the vault volume and keeps notes as markdown committed to git. PostgreSQL stores the `documents` index, embeddings, job records, and operations/audit — never the canonical note content.
- **Why:** provenance, deterministic rollback (`git reset --hard`), and the `raw/wiki` boundary are the core of the system's design; moving content to rows would forfeit git-native history for no functional gain.
- **Alternatives:** notes as Postgres rows (rejected: loses git provenance unless we also export to git, doubling the source of truth).

### D3 — Retrieval: pgvector semantic search only (local embeddings)
Retrieval is **embeddings-only**: a `documents` table holds `wiki/**` metadata + body (for embedding and for answer context), and a pgvector column indexed with **HNSW** (`vector_cosine_ops`, cosine) holds the vectors. Search embeds the query and returns the top-k nearest neighbors. There is **no `tsvector` lexical leg and no hybrid fusion**. Embedding is incremental by normalized-text fingerprint, exactly as `embed-index.ts` does today.
- **Why:** the user wants pure semantic retrieval. Semantic already carried the majority weight (`0.6`) in the old hybrid, and the corpus is a single-user multilingual wiki where paraphrase / cross-lingual matching matters more than exact keyword hits. Consolidating on pgvector keeps everything in one datastore and makes search a single ANN query.
- **On the vector store:** at this scale (hundreds–thousands of 384-dim vectors) the HNSW ANN index gives no real latency win over brute force — pgvector is chosen for **consolidation** (vectors live with `documents`/`jobs`, joined in one SQL query, transactional, concurrent-safe) and to retire the separate gitignored on-disk JSON index, not for speed. It future-proofs scale at ~zero cost (`CREATE EXTENSION vector`).
- **Embeddings run in a local sidecar** (HuggingFace TEI / Ollama serving `multilingual-e5-small`, **384 dims**) reached over the Compose network via an OpenAI-compatible `/v1/embeddings` route; Spring AI's embedding client points at it (see D4). Same model as today, multilingual, and **local/offline** (a sidecar container, not an external API), so search has no external dependency — while keeping the ONNX/DJL weight out of the backend and using the model's native runtime. The pgvector column width is fixed at 384 via a Flyway placeholder (`vector(${EMBED_DIMENSION})`); a model swap is a full re-embed (the index is ephemeral, rebuilt on deploy).
- **Trade-off:** dropping the lexical leg means **exact-term / rare-token queries** (error codes, uncommon proper nouns) can retrieve worse; there is no keyword/BM25 path. This was recommended against but chosen by the user — a `tsvector` leg can be re-added later without schema loss.
- **Alternatives:** keep `tsvector` + hybrid fusion (recommended but declined by the user); in-JVM embedding via `spring-ai-transformers` (DJL/ONNX) (rejected — pulls native libs + model weights and CPU/heap into the backend, forces a Debian image; the sidecar gives the same offline embeddings without that weight and in the model's native runtime); a plain Postgres table + brute-force cosine without pgvector (viable at this scale — rejected for the `<=>` ergonomics and future ANN); an in-JVM in-memory index like today's `state/semantic/` (rejected — re-embed on each restart or a separate persistence to manage); embeddings via the gateway (rejected — external dependency, vector width pinned to the provider); IVFFlat index (rejected — needs a post-load training step).

### D4 — LLM chat via Spring AI (gateway), embeddings via local sidecar
A thin `LlmClient` abstraction wraps Spring AI's **OpenAI-compatible chat** model pointed at the gateway (base URL / model / API key from config), with bounded exponential-backoff retry on 429/5xx (mirroring `lib/llm.ts`); a separate `EmbeddingClient` wraps Spring AI's **OpenAI-compatible embedding** model pointed at the **local embeddings sidecar** (`EMBED_BASE_URL`, D3). A JSON-extraction helper validates LLM output shape before any vault mutation.
- **Why:** the user mandated Spring AI for the OpenAI-compatible calls. Both clients speak the same OpenAI-compatible protocol, so chat targets the remote gateway and embeddings target the local sidecar with no code difference — the sidecar keeps embeddings local/offline without the in-JVM ONNX weight. Centralizing behind thin interfaces keeps the pipelines testable with stub clients (as the current tests inject a stub embedding provider).

### D5 — SSE progress ported from `SolverQueueService`
A `JobEventService` holds a `Set<SseEmitter>` (concurrent set), exposes `GET /api/jobs/events`, and broadcasts a `JobEvent` record (`type`, `jobId`, `jobType`, `queuePosition`, `step`, `result`, `message`). Consumers call `onStarted/onProgress/onCompleted/onFailed`; dead emitters are pruned on `IOException`/timeout/error. nginx serves the events path with `proxy_buffering off` and a long read timeout.
- **Why:** direct, proven port of the reference pattern; `PROGRESS` is added to the reference's event set to satisfy the "intensive SSE progress" requirement for multi-step ingest.

### D6 — Pipelines as Spring services orchestrated by queue consumers, wrapped in a saga
Ingest and answer logic move from CLI macros (`ingest-run.ts`, `answer-run.ts`) into Spring services invoked by the RabbitMQ consumers. Multi-step vault mutations run inside a `PipelineTx`-equivalent saga that registers compensating actions (git reset to pre-run HEAD, idempotency-key restore) and rolls back on failure — a direct port of `lib/pipeline-tx.ts` + `lib/git.ts`.
- **Why:** preserves the current failure semantics and per-operation atomicity; keeps orchestration in explicit services rather than in the queue layer.

### D7 — Frontend: Angular 21 signals shell behind nginx
Standalone components; signal-based state services (e.g. a `JobsStore` fed by an `EventSource` on `/api/jobs/events`, exposing `signal`/`computed` state); PrimeNG for UI; pnpm build served as static assets by nginx. Scope limited to a job/progress dashboard and an ask/ingest console.
- **Why:** matches the reference project's frontend conventions and the user's signals requirement while keeping this change foundational.

### D8 — Deployment topology and config
`docker-compose.yml` at the repo root: `postgres` (pgvector-enabled image or `CREATE EXTENSION` via Flyway), `rabbitmq`, `embeddings` (TEI/Ollama sidecar, internal-only), `backend`, `frontend`, `proxy` (nginx), on one bridge network with healthchecks and `depends_on: condition: service_healthy`. All secrets/config via env (`SPRING_DATASOURCE_*`, `SPRING_RABBITMQ_*`, `LLM_*`, `EMBED_BASE_URL` / `EMBED_MODEL` / `EMBED_DIMENSION`, `TELEGRAM_*`, `VAULT_PATH`, `CORS_ALLOWED_ORIGINS`, `LOG_LEVEL`). The vault is a bind-mounted volume shared with the backend. The embeddings sidecar is not exposed through nginx (backend-internal only).
- **Why:** mirrors the reference compose topology so ops knowledge transfers directly.
- **Indexing stays in the backend (monolith).** Reindex/embed run as RabbitMQ consumers inside the backend rather than a separate service — a separate indexing microservice would share the vault + Postgres + queue (a distributed monolith) for no gain at this scale. If heavy indexing later competes with the API/SSE, the isolation move is an **api + worker split of the same jar** (two containers, different run role), which RabbitMQ already makes trivial; deferred for now.

### D9 — Guided ingestion: connection discovery + human review
Connection discovery combines the LLM mutation plan's proposed links with **semantic neighbors** (pgvector cosine ≥ a configured threshold, mirroring today's enrich-links/health-check). Each ingest carries a `mode`: `unattended` auto-applies guardrailed connections (today's behavior); `validated` commits the baseline note, then parks the job in `AWAITING_REVIEW` and emits the candidate list. A `POST /api/jobs/{id}/review` submits per-candidate accept/reject plus manually-picked targets; accepted connections are applied to the `wiki/**` files via the same mutation-apply path (idempotency + topic guard), then reindex/embed + commit.
- **Why:** the user wants human-in-the-loop connection control on any ingest, applied directly to the knowledge files. Reusing the mutation-apply + guardrails keeps one write path. Default `unattended` preserves current behavior.
- **Manual picker uses a lightweight `pg_trgm`/ILIKE lookup** over `documents` (title/path/body) — deliberately *not* the RAG retrieval, so it does not reintroduce a lexical leg into answering (the user chose semantic-only for the chat). This satisfies the "cajón de búsqueda léxica" without reopening hybrid.
- **Alternatives:** full hybrid retrieval to power the picker (declined by the user); a separate feedback/enrich-links flow decoupled from ingest (rejected — the user wants review inline on every ingest job).

### D10 — Job revert across git + database
Each state-mutating job records its **pre-job git HEAD**, its **produced commit range**, and references to the **rows it created/updated** (documents, embeddings, operations). Revert performs a **`git revert` of the commit range** (a new inverse commit, not history rewrite) plus **compensating DB changes** (delete created rows, restore prior row values), then reindexes and marks the job `REVERTED`. Before applying, it checks whether a **later job touched the same files/rows** and, if so, reports a conflict instead of overwriting.
- **Why:** the user wants to undo a job across both stores. `git revert` keeps history intact and is safe for a vault that may be synced/pushed; conflict detection avoids silently discarding later work. The revert is itself an auditable operation (change-log + commit).
- **Alternatives:** `git reset --hard` to the pre-job SHA (rejected — rewrites history and can discard later jobs; only safe for a strictly local single-user vault); DB-only or git-only revert (rejected — leaves the two stores inconsistent).

### D11 — Multi-format intake (markdown + links; PDF deferred)
Ingest intake writes to `raw/**` first: an uploaded markdown file → `raw/inbox/`; a submitted URL → fetched + extracted (e.g. jsoup/readability) → `raw/web/`. The existing normalize → clean → baseline → discover → apply flow then runs unchanged. PDF extraction is deferred to a follow-up (it adds a parsing dependency and its own edge cases).
- **Why:** preserves the `raw/`-first boundary and the single ingest flow; markdown and links cover the immediate need with minimal new dependencies.

### D12 — Frontend: responsive PrimeNG, SSE-driven, signal stores
The Angular app is fully responsive (PrimeNG responsive layout; verified on mobile viewports). A `JobsStore` signal service consumes `GET /api/jobs/events` via `EventSource`, keeping a signal map of jobs with their phases, **per-file traversal**, and errors. Views: job viewer, chat (enqueue answer + stream), multi-format ingest (upload/link + mode), guided review (checkbox candidate list + `pg_trgm` picker), and revert. On mobile, SSE reconnects with a `Last-Event-ID`-style resume where practical.
- **Why:** matches the reference project's signals/PrimeNG conventions and the user's requirement for a mobile-correct, job-centric UI with inline review.

## Risks / Trade-offs

- **Vault as shared mutable volume in a container** → the backend runs git inside the container with a configured identity; writes are serialized by the single write consumer and wrapped in the saga, so partial failures roll back to pre-run HEAD.
- **Long-running jobs vs. RabbitMQ ack/consumer timeouts** → keep `prefetch=1`, tune consumer acknowledgment timeout for minute-scale jobs, and emit periodic SSE `PROGRESS` so clients see liveness; on redelivery, idempotency keys prevent duplicate application.
- **SSE through nginx buffering / idle timeouts** → dedicated location with `proxy_buffering off`, `proxy_cache off`, long `proxy_read_timeout` (ported from the reference); heartbeat comments keep connections alive.
- **pgvector index tuning (recall vs. latency)** → start with a straightforward HNSW/IVFFlat index; the dataset is small (single-user wiki), so defaults are acceptable and tunable later.
- **Behavioral drift from the Node oracle** → port contract-by-contract and keep the existing TypeScript tools as an oracle; carry over the JSON contracts and idempotency/guardrail tests as backend tests.
- **No lexical/keyword path** → pure semantic retrieval can miss exact-term / rare-token queries (error codes, uncommon proper nouns). Accepted per the user's decision; a `tsvector` leg can be re-added later without schema loss if it proves necessary.
- **Embedding runtime parity** → we keep `multilingual-e5-small` but serve it from a TEI/Ollama sidecar instead of `@xenova` in Node; vectors should be equivalent, and the index is rebuilt on deploy regardless (ephemeral today), so any minor runtime difference is absorbed by a full re-embed. Note e5 models expect `query:` / `passage:` input prefixes — apply them in the `EmbeddingClient` to match the model's intended use.
- **Embeddings sidecar availability** → search and embedding depend on the sidecar being up; add a healthcheck and `depends_on: service_healthy`, and surface a clear error when embedding fails (there is no lexical fallback).
- **Revert conflicts across jobs** → if a later job touched the same files/rows, a `git revert` may conflict or discard intent; we detect the overlap up front and report a conflict rather than force it — the reviewer resolves manually.
- **Guided-review partial application** → applying a subset of candidates must stay idempotent and safe; reuse the mutation-apply path (idempotency keys + topic guard) so an accepted-then-reapplied set does not duplicate, and record the review decision in the operation/audit trail.
- **Link/upload intake as attack surface** → validate upload size/type (markdown only for now), sanitize fetched HTML, cap fetch size/time, and never execute fetched content; writes land in `raw/**` and go through the same guardrailed pipeline.
- **Mobile SSE reconnection** → phones drop connections on background/network switch; the `JobsStore` reconnects and refetches job state via `GET /api/jobs/{id}` so the viewer converges after a reconnect.
- **Scope creep** → PDF/YouTube extraction, answer-side feedback, and maintenance are explicitly deferred; the answer pipeline only stubs the feedback flag.

## Migration Plan

1. Scaffold `backend/` (Spring Boot, Flyway baseline enabling pgvector) and `frontend/` (Angular signals shell); add root `docker-compose.yml`, `docker/nginx.conf`, and env samples.
2. Implement `vault-git-store` (safe paths, markdown merge, mutation apply + guards, git commit + change-log, saga) against the mounted vault.
3. Implement `llm-integration` (Spring AI chat + local embeddings) and `semantic-retrieval` (pgvector, reindex + incremental embed jobs, top-k nearest-neighbor search).
4. Implement `job-queue-and-progress` (RabbitMQ queues, job entity + repository, consumers, SSE) and wire enqueue REST endpoints.
5. Port `ingest-pipeline` (with markdown/link intake and per-file progress) and `answer-pipeline` as services invoked by the consumers, with SSE progress.
6. Implement `guided-ingestion` (connection discovery, `unattended`/`validated` modes, `AWAITING_REVIEW`, review submit + `pg_trgm` picker) and `job-revert` (revert metadata capture, git-revert + compensating DB, conflict detection).
7. Add the backend `telegram-bot` (long polling) routing `/ask` and `/ingest` onto the queues.
8. Build the responsive `frontend-experience` (job viewer with file traversal, chat, multi-format ingest, guided review, revert) consuming `/api/jobs/events`.
9. Retire n8n: remove `n8n/`, the runner image, and n8n-specific docs/env; update README/runbook.

**Rollback:** the change is additive to a new stack; the existing Node/n8n toolchain remains in the repo as the oracle and can continue to run until the Spring stack is validated. The vault content is untouched (git-backed), so switching orchestrators does not risk knowledge loss.

## Resolved Decisions

_The four open questions were resolved with the user before implementation:_

- **Telegram library** → **TelegramBots v8** long-polling Spring Boot starter (rubenlagus), registered as a bean. It handles the `getUpdates` loop, offset management, backoff, and 4096-char chunking; we only use the long-polling consumer. Since updates are parsed and immediately enqueued onto RabbitMQ, framework coupling is minimal.
- **pgvector index** → **HNSW** with `vector_cosine_ops` (cosine), default params (`m=16`, `ef_construction=64`). No training step, good recall, handles incremental inserts at single-user scale.
- **Embedding model + dimension** → **`multilingual-e5-small` (384 dims)** served by a **local embeddings sidecar** (HF TEI / Ollama, OpenAI-compatible), reached via `EMBED_BASE_URL` — identical model to today, multilingual, local/offline, and out of the JVM. The pgvector column is `vector(${EMBED_DIMENSION})` (Flyway placeholder, default `384`); the ephemeral index is rebuilt on deploy, so a future model swap is a re-embed, not a migration.
- **Embedding & indexing topology** → embeddings run in a **separate local sidecar** (stateless, CPU-bound — a clean microservice boundary, keeps ONNX/DJL out of the backend); **indexing stays in the backend monolith** (too coupled to vault + Postgres + queue to extract). An api/worker split of the same jar is the deferred isolation step if indexing load ever competes with the API/SSE.
- **Change-log** → **both, with distinct roles**: the markdown change-log under `state/change-log/` stays the git-committed **provenance** record (source of truth); a lightweight Postgres `operations`/audit table stores only queryable metadata (job id, type, status, commit SHA, affected-note count, timestamps) for the dashboard and SSE history. Git = truth, Postgres = derived queryable state (consistent with D2).

## Deferred Work (future changes)

Explicitly out of scope for this foundational change. Each item lists the **Node oracle** (existing `tools/**` script and/or `openspec/specs/**` capability) that remains the behavioral source of truth to port when it is picked up as its own `/opsx:propose` change.

- **PDF ingestion** — accept PDF uploads and extract text before the normal ingest flow. Oracle: `tools/cmd/pdf-extract.ts` (`@opendocsg/pdf2md`). Backend candidate: Apache PDFBox/Tika. Frontend: enable PDF in the multi-format ingest UI. (Intake plumbing for md/links already exists — this is mostly the extractor + a raw/inbox write.)
- **YouTube ingestion** — fetch subtitles and write a `raw/web/**` artifact. Oracle: `tools/cmd/youtube-transcript.ts` (`yt-dlp`). Ships as a new source kind on the existing intake path.
- **Answer-side feedback propagation** — evaluate an answer for reusable knowledge and propagate approved corrections into `wiki/**`. Oracle: `tools/cmd/feedback-record.ts`, the `KB - Apply Feedback` workflow, and the Feedback Record contract in `docs/architecture.md`. Note: the answer pipeline already sets `should_review_for_feedback`; this change stubs it. (The *ingest*-side connection review is already delivered via `guided-ingestion`.)
- **Maintenance flows (lint + health-check)** — structural linting and semantic/traceability health checks with optional auto-fixes, on weekly/monthly schedules. Oracle: `tools/cmd/lint.ts`, `tools/cmd/health-check.ts`. In the new stack these become scheduled jobs on the queue emitting the same Maintenance Result contract.
- **Term-topic resolution** — redirect a concept term to an existing topic `update` when cosine similarity ≥ `TOPIC_MATCH_THRESHOLD`. Oracle: `tools/services/ingest/resolve-terms.ts` + `openspec/specs/term-topic-resolution`. Slots into connection discovery / the ingest mutation plan.
- **Concept dedup check** — dedup concept `create`s against existing notes on disk during ingest. Oracle: `openspec/specs/concept-dedup-check`. A guardrail step in the ingest apply path.
- **Full enrich-links batch** — vault-wide link enrichment (beyond per-ingest discovery). Oracle: `tools/cmd/enrich-links.ts`, `enrich-batch.ts`, `openspec/specs/enrich-links-script` + `enrich-links-workflow`. `guided-ingestion` covers the per-job case; the batch sweep over the whole vault is deferred.
- **Hybrid / lexical retrieval for RAG** — reintroduce a `tsvector` lexical leg and `0.6·sem + 0.4·lex` fusion for the chat (recommended but declined for now). Re-addable without schema loss; the `pg_trgm` file lookup and `documents` table already exist.
- **api + worker split** — run the same backend jar as separate `api` and `worker` containers to isolate heavy indexing/ingest from API/SSE (see D8). Deferred until indexing load warrants it; RabbitMQ already decouples the work.
- **Multi-user auth & roles** — beyond the JWT-ready security scaffold; single-user is assumed for now (reference: `dog-booking-planner` `auth` spec).

When starting any of these, run `/opsx:propose <name>` and read both the Node oracle and this change's shipped specs so the JSON contracts, idempotency keys, topic guard, and git provenance carry over unchanged.
