# Stakeholders

| Stakeholder | Interes principal | Evidencia |
|---|---|---|
| Operador/desarrollador del sistema | Ejecutar, configurar y mantener el stack local o self-hosted | `README.md`, `.env.sample`, `docker-compose.yml` |
| Usuario autenticado | Ingestar fuentes, preguntar al conocimiento, revisar enlaces y editar notas | `frontend/src/app/components/*.component.ts`, `AuthController` |
| Administrador | Gestionar usuarios y seguridad inicial | `AuthController.register`, `UserService.seedAdmin` |
| Bot de Telegram autorizado | Enviar preguntas e ingestas remotas | `WikiBotService`, `TelegramBotConfig` |
| Proveedor LLM OpenAI-compatible | Generar notas, planes, respuestas, keywords y explicaciones de enlaces | `OpenAiCompatibleLlmClient`, tabla `llm_prompts` |
| Sidecar TEI | Generar embeddings normalizados para busqueda semantica | `OpenAiCompatibleEmbeddingClient`, servicio `embeddings` en Compose |
| Repositorio WebDAV externo | Replicar opcionalmente archivos markdown del vault | `WebDavSyncService`, `WebDavClient` |

No determinado a partir del repositorio: roles organizativos formales, acuerdos de disponibilidad, propietarios de producto o politicas de datos externas.

