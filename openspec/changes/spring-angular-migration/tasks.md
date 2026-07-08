## 1. Repo & Docker scaffold (platform-foundation)

- [ ] 1.1 Create `backend/` Spring Boot 3.3.x / Java 21 Maven project with starters: web, data-jpa, amqp, validation, security, actuator; plus Flyway, pgvector, MapStruct, Lombok, springdoc, Spring AI (OpenAI-compatible chat + embedding clients), a link/HTML fetch+extract lib (e.g. jsoup), and the TelegramBots v8 long-polling starter
- [ ] 1.2 Create package layout `config/ controllers/ services/ repositories/ domain/ dto/ mappers/` and set `/api` base path
- [ ] 1.3 Create `frontend/` Angular 21 app (standalone components, signals, PrimeNG, pnpm, responsive layout) with `start`/`build` scripts
- [ ] 1.4 Add root `docker-compose.yml`: `postgres` (17 + pgvector), `rabbitmq` (3.13-management), `embeddings` (TEI/Ollama sidecar serving `multilingual-e5-small`, internal-only, healthcheck), `backend`, `frontend`, `proxy` (nginx) on one network, with healthchecks and `depends_on: service_healthy`
- [ ] 1.5 Add `docker/nginx.conf`: route `/`→frontend, `/api/**`→backend, and a dedicated `/api/jobs/events` location with `proxy_buffering off`, `proxy_cache off`, long `proxy_read_timeout`
- [ ] 1.6 Add `backend/Dockerfile` (multi-stage temurin build) and `frontend/Dockerfile` (pnpm build → nginx static)
- [ ] 1.7 Add `.env.sample` with `SPRING_DATASOURCE_*`, `SPRING_RABBITMQ_*`, `LLM_*`, `EMBED_BASE_URL` / `EMBED_MODEL` (default `multilingual-e5-small`) / `EMBED_DIMENSION` (default 384), `TELEGRAM_*`, `VAULT_PATH`, `CORS_ALLOWED_ORIGINS`, `LOG_LEVEL`
- [ ] 1.8 Configure CORS from `CORS_ALLOWED_ORIGINS`, Actuator health (datasource + broker + embeddings sidecar), and springdoc/OpenAPI UI

## 2. Database schema (platform-foundation, semantic-retrieval, job-queue-and-progress, guided-ingestion, job-revert)

- [ ] 2.1 Flyway baseline migration: `CREATE EXTENSION IF NOT EXISTS vector` and `CREATE EXTENSION IF NOT EXISTS pg_trgm`
- [ ] 2.2 Migration for `documents` table (id, path, title, doc_type, updated_at, body) + GIN `pg_trgm` indexes on title/path/body for the manual lookup — no full-text lexical index for RAG (embeddings-only)
- [ ] 2.3 Migration for `document_embeddings` (document ref, model, dimension, `vector(${EMBED_DIMENSION})` column via Flyway placeholder [default 384], normalized-text hash, HNSW index with `vector_cosine_ops`)
- [ ] 2.4 Migration for `jobs` (id, type, mode [`unattended`/`validated`], status [`QUEUED/STARTED/PROGRESS/AWAITING_REVIEW/COMPLETED/FAILED/REVERTED`], payload_ref, queue_position, pre_git_sha, commit_range, affected_paths (json), result, error, timestamps)
- [ ] 2.5 Migration for an `operations`/audit table (job id, type, status, commit SHA, affected-note count, timestamps) for querying/dashboard; the markdown change-log under `state/change-log/` remains the git-committed provenance source of truth
- [ ] 2.6 Migration for `job_connection_candidates` (job id, target_path, proposed link/section, source [`llm`/`semantic`], score, decision [`pending/accepted/rejected`])

## 3. Vault git store (vault-git-store)

- [ ] 3.1 Vault-root path resolver that rejects traversal/absolute escapes and emits normalized POSIX vault paths
- [ ] 3.2 Frontmatter parse/serialize + markdown section parser and idempotent section/frontmatter merge renderer
- [ ] 3.3 Mutation-plan model (create/update/noop) + applier with idempotency-key tracking and idempotent-hit reporting
- [ ] 3.4 Topic-creation hard guard (reject `create` under `wiki/topics/**`; allow `update`)
- [ ] 3.5 Git service: staged per-operation commit with configured identity + structured change-log entry writer; return commit SHA and commit range
- [ ] 3.6 `PipelineTx` saga (compensating actions) + git `getHead`/`resetHard`/`revertRange` helpers for rollback and revert
- [ ] 3.7 Unit tests over a temp vault + temp git repo (idempotency, topic guard, merge no-dup, rollback, revert)

## 4. LLM integration (llm-integration)

- [ ] 4.1 Configure Spring AI OpenAI-compatible chat model from `LLM_*` env (base URL, model, key)
- [ ] 4.2 Configure the Spring AI OpenAI-compatible embedding client pointed at the sidecar (`EMBED_BASE_URL`, `multilingual-e5-small`, 384 dims) matching the pgvector column width; apply e5 `query:`/`passage:` prefixes; keep `EMBED_DIMENSION` in sync
- [ ] 4.3 `LlmClient` chat wrapper with bounded exponential-backoff retry on 429/5xx and fast-fail on other 4xx; `EmbeddingClient` surfaces a clear error when the sidecar is unreachable
- [ ] 4.4 JSON-extraction + shape-validation helper used before any vault mutation
- [ ] 4.5 Tests with a stub chat/embedding client (retry behavior, JSON extraction, invalid-JSON rejection, sidecar-down error)

## 5. Semantic retrieval + file lookup (semantic-retrieval)

- [ ] 5.1 Reindex service: walk `wiki/**`, parse frontmatter/body, upsert `documents` in one transaction (wiki-only, never raw)
- [ ] 5.2 Incremental embed service (via the embeddings sidecar): normalized-text fingerprint, skip unchanged, prune deleted, write pgvector rows
- [ ] 5.3 Semantic search: embed query with the same sidecar model, top-k by cosine distance over the HNSW index
- [ ] 5.4 Lexical file lookup (`pg_trgm`/ILIKE over title/path/body) for the manual connection picker — independent of RAG retrieval
- [ ] 5.5 Tests: incremental skip/prune, nearest-neighbor ordering, empty-index returns empty, `pg_trgm` lookup matches

## 6. Job queue + SSE progress (job-queue-and-progress)

- [ ] 6.1 `RabbitConfig`: durable `wiki-write-jobs` (single consumer, `prefetch=1`), `answer-jobs`, and dead-letter queue/binding
- [ ] 6.2 `Job` entity + repository and lifecycle transitions (`QUEUED→STARTED→COMPLETED/FAILED`, plus `AWAITING_REVIEW` and `REVERTED`)
- [ ] 6.3 `JobEventService`: `Set<SseEmitter>` registry, `subscribe()`, broadcast `JobEvent` (`QUEUED/STARTED/PROGRESS/AWAITING_REVIEW/COMPLETED/FAILED/REVERTED`) plus per-file events (path + action), prune dead emitters
- [ ] 6.4 `GET /api/jobs/events` SSE controller + `GET /api/jobs/{id}` status endpoint (for reconnect refetch)
- [ ] 6.5 Enqueue REST endpoints returning `202 Accepted` with job id + queue position (persist job, publish message)
- [ ] 6.6 Consumers with bounded retries → dead-letter on exhaustion; mark job `FAILED` with last error
- [ ] 6.7 Tests: write-job serialization, status transitions, SSE emitter cleanup, retry→DLQ

## 7. Ingest pipeline (ingest-pipeline)

- [ ] 7.1 Intake: markdown upload → write under `raw/inbox/`; link/URL → fetch + HTML extract → write under `raw/web/` (PDF deferred); validate size/type, sanitize HTML
- [ ] 7.2 Normalize `raw/**` artifact → source payload (reject non-raw); infer kind, checksum, metadata
- [ ] 7.3 LLM source-note cleaning + shape validation (non-empty summary/raw-context)
- [ ] 7.4 Baseline plan (create `wiki/sources/` note + root index update) → apply → reindex → commit (always, both modes)
- [ ] 7.5 LLM mutation plan request + guardrails (paths, idempotency, topic guard, required source support); unsafe→noop with rejection report
- [ ] 7.6 Mode branch: `unattended` auto-applies safe connections → reindex → commit; `validated` defers to guided review (group 8)
- [ ] 7.7 Enforce `Sources` backlink on grounded concept/entity/topic/analysis updates
- [ ] 7.8 Emit SSE `PROGRESS` per step + per-file events; terminal `COMPLETED`/`AWAITING_REVIEW`/`FAILED`; wire into the write consumer
- [ ] 7.9 Integration test: raw fixture → baseline + guardrailed plan → commits; failure rolls back to pre-run HEAD

## 8. Guided ingestion (guided-ingestion)

- [ ] 8.1 Connection discovery: merge LLM-proposed links with semantic neighbors (pgvector cosine ≥ threshold); persist as `job_connection_candidates`
- [ ] 8.2 In `validated` mode, park the job in `AWAITING_REVIEW` after the baseline commit and emit the candidate list over SSE
- [ ] 8.3 `POST /api/jobs/{id}/review`: per-candidate accept/reject + manually-selected target paths (from the `pg_trgm` lookup)
- [ ] 8.4 Apply accepted connections via the mutation-apply path (idempotency + topic guard) → reindex/embed → commit; reject writes nothing
- [ ] 8.5 Record the review as an operation/audit entry; make the flow available for any ingest source kind
- [ ] 8.6 Tests: validated flow (accept subset + manual pick), partial-apply idempotency, unattended auto-apply parity

## 9. Job revert (job-revert)

- [ ] 9.1 Capture revert metadata on every state-mutating job (pre_git_sha, commit_range, affected paths + row refs)
- [ ] 9.2 `POST /api/jobs/{id}/revert` enqueues a revert operation
- [ ] 9.3 Revert: `git revert` the job's commit range + compensating DB changes (delete created rows, restore updated rows) → reindex → mark `REVERTED`
- [ ] 9.4 Conflict detection: if a later job touched the same files/rows, report a conflict and do not overwrite
- [ ] 9.5 Record the revert as its own auditable operation (change-log + commit)
- [ ] 9.6 Tests: clean revert (git + DB consistent), conflict detection blocks silent overwrite

## 10. Answer pipeline (answer-pipeline)

- [ ] 10.1 Answer service: semantic retrieval (top-k nearest neighbors) → read retrieved `wiki/**` → bounded context packet
- [ ] 10.2 LLM answer synthesis → write artifact under `outputs/` → answer record with evidence refs; no wiki mutation
- [ ] 10.3 Cleanup written artifact on later-step failure
- [ ] 10.4 Set `should_review_for_feedback` flag (feedback propagation deferred)
- [ ] 10.5 Emit SSE `PROGRESS`/terminal events; wire into the answer consumer
- [ ] 10.6 Integration test: question → context → synthesized answer record, no `wiki/**` change

## 11. Telegram bot (telegram-bot)

- [ ] 11.1 Register the TelegramBots v8 long-polling consumer as a bean, started with the backend from `TELEGRAM_*` config (outbound-only; getUpdates/offset/backoff/4096-chunking handled by the library)
- [ ] 11.2 Authorize the configured allowed chat id; ignore all other chats
- [ ] 11.3 Route `/ask`/free text → answer queue, `/ingest <url>` → ingest queue; return enqueue ack
- [ ] 11.4 On job completion, send the result (or handled failure) back to the originating chat
- [ ] 11.5 Test: routing + authorization + serialized `/ingest` handling

## 12. Frontend experience (frontend-experience)

- [ ] 12.1 Responsive PrimeNG layout/theme; verify all views usable on a mobile viewport (no horizontal overflow)
- [ ] 12.2 Signals `JobsStore` backed by an `EventSource` on `/api/jobs/events` (jobs map: phases, per-file traversal, errors); reconnect + refetch `GET /api/jobs/{id}`
- [ ] 12.3 Job viewer component: live phases, per-file traversal list, and error display
- [ ] 12.4 Chat view: submit question, stream progress, render answer + evidence references
- [ ] 12.5 Multi-format ingest UI: markdown upload / link submit + `unattended`/`validated` mode selector
- [ ] 12.6 Guided review UI: candidate connections as accept/reject checkboxes + `pg_trgm` manual file-search picker → submit
- [ ] 12.7 Revert action UI: trigger revert, show progress and success or reported conflict
- [ ] 12.8 API client services (enqueue ingest/answer, job status, review submit, revert, file lookup); same-origin behind nginx

## 13. Retire n8n & docs (BREAKING)

- [ ] 13.1 Remove `n8n/` workflows, the runner image, and n8n-specific Docker/env/runbook sections
- [ ] 13.2 Update `README.md` + docs to the new stack (compose quick start, API base URL, SSE, guided ingestion, revert, Telegram polling)
- [ ] 13.3 Update `.env.sample`/`AGENTS.md` execution-model references (n8n → Spring Boot + RabbitMQ + embeddings sidecar)

## 14. Verification

- [ ] 14.1 `docker compose up --build` brings up all services healthy (incl. embeddings sidecar); Actuator health `UP`
- [ ] 14.2 Ingest a markdown fixture in `unattended` mode → SSE shows phases + per-file events → source note committed; documents/embeddings updated
- [ ] 14.3 Ingest in `validated` mode → job reaches `AWAITING_REVIEW` → review accepts a subset + one manual `pg_trgm` pick → accepted connections applied to files + committed
- [ ] 14.4 Revert that job → git reverted + DB rolled back + status `REVERTED`; a conflicting later change is reported instead of overwritten
- [ ] 14.5 Ingest a link → fetched/extracted into `raw/web/` → processed through the same flow
- [ ] 14.6 Ask a question (chat) → SSE progress → answer artifact under `outputs/`, no `wiki/**` mutation
- [ ] 14.7 Telegram `/ask` and `/ingest` from the allowed chat produce results; other chats ignored
- [ ] 14.8 Semantic search returns nearest-neighbor results; empty embedding table returns none; `pg_trgm` picker returns matching files
- [ ] 14.9 Mobile viewport: job viewer, chat, ingest, and review all render usable
