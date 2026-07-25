# Flujos de ejecucion

## Ingesta desatendida

```mermaid
sequenceDiagram
  participant UI as UI/Telegram
  participant API as JobController
  participant Raw as RawIntakeService
  participant Q as RabbitMQ
  participant P as IngestPipelineService
  participant LLM as LLM
  participant DB as PostgreSQL
  participant Vault as Vault

  UI->>API: POST /ingest, /ingest/upload o /ingest/text
  API->>Raw: escribir raw/**
  API->>Q: enqueue INGEST
  Q->>P: consume wiki-write-jobs
  P->>Vault: capturar ledger + snapshot
  P->>LLM: limpiar source note JSON
  P->>Vault: crear wiki/sources/**
  P->>DB: reindex documents
  P->>DB: upsert embeddings
  P->>LLM: plan opcional de conceptos
  P->>DB: resolver duplicados por semantic search + juez LLM
  P->>DB: descubrir conexiones LLM/semantic/topic
  P->>Vault: aplicar conexiones aceptadas automaticamente
  P->>DB: finalizar snapshot y job
```

Fuente: `IngestPipelineService.java`, `RawIntakeService.java`, `SourceNoteLlmService.java`, `ConnectionDiscoveryService.java`.

## Ingesta validada

```mermaid
sequenceDiagram
  participant UI as UI
  participant P as IngestPipelineService
  participant Review as GuidedReviewService
  participant Vault as Vault
  participant DB as PostgreSQL

  P->>Vault: aplica source note baseline
  P->>DB: reindex + embeddings + candidates
  P->>DB: guarda job AWAITING_REVIEW
  UI->>Review: GET /jobs/{id}/review
  UI->>Review: POST /jobs/{id}/review
  Review->>Vault: aplica backlinks y forward links aceptados
  Review->>DB: reindex + embeddings + snapshot
  Review->>UI: job COMPLETED por SSE
```

## Respuesta

```mermaid
sequenceDiagram
  participant UI as UI/Telegram
  participant API as JobController
  participant Q as RabbitMQ
  participant A as AnswerPipelineService
  participant E as TEI
  participant DB as PostgreSQL
  participant LLM as LLM
  participant Vault as Vault

  UI->>API: POST /answer
  API->>Q: enqueue ANSWER
  Q->>A: consume answer-jobs
  A->>E: embed query
  A->>DB: top-k pgvector
  A->>LLM: pregunta + contexto acotado
  A->>Vault: outputs/answer-<jobId>.md
  A->>API: estado COMPLETED por SSE
```

## Autenticacion

```mermaid
sequenceDiagram
  participant UI as LoginComponent
  participant API as AuthController
  participant Sec as Spring Security
  participant DB as users/login_events

  UI->>API: POST /auth/login
  API->>Sec: AuthenticationManager
  Sec->>DB: cargar User
  alt 2FA activado
    API-->>UI: challengeToken scope=2fa
    UI->>API: POST /auth/login/2fa
    API->>DB: validar TOTP secret
  end
  API->>DB: registrar login event
  API-->>UI: JWT scope=access
  UI->>API: Authorization: Bearer token
```

## Reindex y embeddings

```mermaid
flowchart LR
  wiki[wiki/**/*.md] --> reindex[ReindexService]
  reindex --> documents[(documents)]
  documents --> hash[EmbeddingIndexService\nnormaliza texto y calcula SHA-256]
  hash --> changed{hash cambio?}
  changed -- no --> skip[skip]
  changed -- si --> tei[TEI /embed]
  tei --> embeddings[(document_embeddings)]
  embeddings --> prune[prune embeddings obsoletos]
```

## Health Check como job

```mermaid
sequenceDiagram
  participant UI as Settings UI
  participant API as HealthCheckJobController
  participant Q as RabbitMQ
  participant H as HealthCheckJobHandler
  participant S as HealthCheckService
  participant DB as PostgreSQL
  participant Vault as Vault

  UI->>API: POST /jobs/health-check
  alt parcial
    UI->>API: POST /jobs/health-check/partial {paths}
    API->>Vault: raw/health-check/<uuid>.json
  end
  API->>Q: enqueue HEALTH_CHECK
  Q->>H: consume wiki-write-jobs
  H->>S: discover(pathFilter)
  S->>DB: reindex documents + embeddings
  S->>DB: semantic search general + topic
  H->>Vault: beginSnapshot(jobId, HEALTH_CHECK)
  H->>S: applyConnections(computed, snapshot)
  S->>Vault: reemplazar Related calculado
  H->>DB: finalizeSnapshot(snapshot, job)
  H->>UI: progreso por /jobs/events
```

El endpoint anterior `GET /api/settings/health-check` fue reemplazado por endpoints `POST` bajo `/api/jobs/**`. El frontend solo encola el trabajo y delega el seguimiento al panel global de jobs.

Fuente: `HealthCheckJobController.java`, `HealthCheckJobHandler.java`, `HealthCheckService.java`, `JobConsumers.java`, `frontend/src/app/components/settings.component.ts`, `frontend/src/app/components/health-check-selection-modal.component.ts`.

## Manejo de errores en jobs

```mermaid
flowchart TB
  job[Job STARTED] --> run[Pipeline]
  run --> ok[COMPLETED]
  run --> fail{Exception}
  fail --> rollback[PipelineTx rollback\nledger + snapshot + vault files]
  rollback --> failed[Job FAILED]
  fail --> retry[Rabbit retry max 3\nsi la excepcion llega al listener]
  retry --> dlq[wiki-jobs-dead-letter]
```

Nota: `JobConsumers` captura excepciones y marca el job como `FAILED`; el interceptor Rabbit aplica reintentos cuando una excepcion sale del listener.

Fuente: `JobConsumers.java`, `RabbitConfig.java`, `PipelineTx.java`, `SnapshotService.java`.
