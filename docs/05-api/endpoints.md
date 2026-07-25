# Endpoints

Todos los paths incluyen el prefijo `/api` en runtime.

## Auth

| Metodo | Path | Body/params | Respuesta |
|---|---|---|---|
| `POST` | `/auth/login` | `{username,password}` | JWT o desafio 2FA |
| `POST` | `/auth/login/2fa` | `{challengeToken,code}` | JWT |
| `GET` | `/auth/me` | - | Usuario actual |
| `GET` | `/auth/login-history` | - | Eventos de login |
| `POST` | `/auth/password` | `{currentPassword,newPassword}` | `{status:"ok"}` |
| `POST` | `/auth/2fa/setup` | - | secret, otpauthUri, qrDataUri |
| `POST` | `/auth/2fa/confirm` | `{code}` | `{twoFactorEnabled:true}` |
| `POST` | `/auth/2fa/disable` | `{code}` | `{twoFactorEnabled:false}` |
| `POST` | `/auth/register` | `{username,email,password,roles}` | Usuario creado, admin only |

## Jobs, ingesta y respuesta

| Metodo | Path | Uso |
|---|---|---|
| `GET` | `/jobs/events` | SSE global de jobs |
| `GET` | `/jobs` | Ultimos 50 jobs |
| `GET` | `/jobs/{id}` | Estado completo de job |
| `DELETE` | `/jobs/{id}` | Cancelar job `QUEUED` o `AWAITING_REVIEW` |
| `POST` | `/jobs/{id}/abandon` | Marcar job `STARTED/PROGRESS` como fallido |
| `POST` | `/ingest` | Encolar ingesta por `url` o `payloadRef` |
| `POST` | `/ingest/upload` | Encolar upload PDF/Markdown multipart |
| `POST` | `/ingest/text` | Encolar texto Markdown |
| `POST` | `/answer` | Encolar respuesta |
| `POST` | `/jobs/{id}/revert` | Encolar reversión |
| `POST` | `/jobs/enrich?path=` | Enriquecer nota existente |
| `POST` | `/jobs/rename?path=&newName=` | Renombrado como job |
| `POST` | `/jobs/health-check` | Encolar Health Check completo como `HEALTH_CHECK` |
| `POST` | `/jobs/health-check/partial` | Encolar Health Check parcial con body `{paths:[...]}` |
| `GET` | `/jobs/{id}/review` | Candidatos de revision |
| `POST` | `/jobs/{id}/review` | Decisiones y targets manuales |
| `GET` | `/files/lookup?q=&limit=` | Lookup lexical |
| `GET` | `/jobs/link-discovery-stream?path=` | SSE de discovery semantico para una nota |

## Files

| Metodo | Path | Uso |
|---|---|---|
| `GET` | `/files/tree` | Arbol markdown del vault |
| `GET` | `/files/content?path=` | Leer markdown |
| `PUT` | `/files/content?path=` | Guardar markdown |
| `POST` | `/files/content?path=` | Crear archivo |
| `DELETE` | `/files/content?path=` | Borrar archivo |
| `GET` | `/files/resource?path=` | Leer recurso imagen |
| `POST` | `/files/upload-image` | Subir imagen |
| `POST` | `/files/rename?path=&newName=` | Renombrar |
| `POST` | `/files/move?path=&targetDir=` | Mover |
| `POST` | `/files/directory?path=` | Crear directorio |
| `GET` | `/files/versions?path=` | Versiones por snapshot |
| `GET` | `/files/version?path=&versionId=` | Contenido de version |
| `GET` | `/files/pdf?path=` | Exportar PDF |

## Settings, mantenimiento y prompts

| Metodo | Path | Uso |
|---|---|---|
| `GET` | `/settings/prompts` | Lista prompts |
| `GET` | `/settings/prompts/{key}` | Leer prompt |
| `PUT` | `/settings/prompts/{key}` | Actualizar prompt |
| `GET` | `/settings/resources` | Configuracion carpeta recursos |
| `PUT` | `/settings/resources` | Actualizar carpeta recursos |
| `GET` | `/settings/reindex` | SSE reindex |
| `GET` | `/settings/keywords/generate` | SSE keywords faltantes |
| `GET` | `/settings/broken-links/scan` | SSE scan de enlaces rotos |
| `DELETE` | `/settings/broken-links` | Borrar enlaces rotos seleccionados |
| `POST` | `/keywords/regenerate` | Encolar regeneracion de keywords para paths |

## Otros

| Metodo | Path | Uso |
|---|---|---|
| `GET` | `/webdav/sync` | SSE pull/reconcile WebDAV |
| `GET` | `/webdav/conflicts` | Conflictos pendientes |
| `POST` | `/webdav/conflicts/resolve` | Resolver conflicto |
| `GET` | `/history?page=&size=` | Historial por archivo |
| `GET` | `/history/{changeId}/diff` | Diff unificado |
| `POST` | `/chat/sessions` | Crear sesion |
| `GET` | `/chat/sessions` | Listar sesiones |
| `GET` | `/chat/sessions/{id}` | Detalle |
| `DELETE` | `/chat/sessions/{id}` | Borrar |
| `POST` | `/chat/sessions/{id}/messages` | Enviar mensaje |
| `POST` | `/chat/sessions/{id}/export-to-vault` | Exportar a `outputs/**` |
| `GET` | `/graph` | Grafo de wiki links |
| `GET` | `/notes/list?folders=` | Lista notas por carpetas |
| `POST` | `/notes/explain-link` | Explicar enlace entre notas |
| `GET` | `/documents/embedding-status?path=` | Estado de embedding de una nota |
| `GET` | `/platform` | Estado simple de plataforma |

Fuente: `backend/src/main/java/com/dpswikillm/controllers/*.java`, `frontend/src/app/services/api.service.ts`.
