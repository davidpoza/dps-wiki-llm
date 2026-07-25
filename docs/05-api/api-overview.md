# API HTTP

El backend Spring Boot configura el servlet context path como `/api` en `WebConfig`; los controladores declaran rutas relativas como `/auth`, `/jobs`, `/files`.

El frontend consume siempre paths bajo `/api`.

## Familias de endpoints

| Familia | Base | Responsabilidad |
|---|---|---|
| Auth | `/api/auth/**` | Login, 2FA, usuario actual, cambio de password, registro admin. |
| Jobs/Ingest/Answer | `/api/jobs/**`, `/api/ingest`, `/api/answer` | Encolado, progreso, revision y reversión. |
| Files | `/api/files/**` | Arbol, contenido, versiones, PDF, imagenes. |
| Settings | `/api/settings/**` | Prompts, recursos, reindex, keywords, health-check, enlaces rotos. |
| WebDAV | `/api/webdav/**` | Sync, conflictos y resolucion. |
| Chat | `/api/chat/sessions/**` | Conversaciones persistidas y exportacion. |
| Graph/Notes/Documents | `/api/graph`, `/api/notes/**`, `/api/documents/**` | Grafo, listas, explicacion de links y estado de embeddings. |

Fuente: `backend/src/main/java/com/dpswikillm/config/WebConfig.java`, `backend/src/main/java/com/dpswikillm/controllers/*.java`, `frontend/src/app/services/api.service.ts`.

## Tiempo real

Los endpoints SSE devuelven `text/event-stream`. Como `EventSource` no permite cabeceras custom, el backend acepta `token` por query string.

Fuente: `JwtAuthFilter.java`, `frontend/src/app/services/api.service.ts`.
