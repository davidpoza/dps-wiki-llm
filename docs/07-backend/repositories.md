# Repositorios backend

La mayoria de repositorios son Spring Data JPA. `DocumentIndexRepository` tiene implementacion JDBC porque necesita SQL especifico de PostgreSQL/pgvector.

| Repositorio | Tabla/uso |
|---|---|
| `UserRepository` | `users` |
| `LoginEventRepository` | `login_events` |
| `JobRepository` | `jobs` |
| `JobConnectionCandidateRepository` | `job_connection_candidates` |
| `OperationRepository` | `operations` |
| `SnapshotRepository` | `snapshots` |
| `SnapshotFileRepository` | `snapshot_files` |
| `LlmPromptRepository` | `llm_prompts` |
| `AppSettingRepository` | `app_settings` |
| `VaultFileSyncRepository` | `vault_file_sync` |
| `ChatSessionRepository`, `ChatMessageRepository` | `chat_sessions`, `chat_messages` |
| `JdbcDocumentIndexRepository` | `documents`, `document_embeddings`, busqueda lexical/semantic |

Fuente: `backend/src/main/java/com/dpswikillm/repositories/*.java`.

