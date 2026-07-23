## Why

La pantalla `/chat` actual es una interfaz de preguntas aisladas sin memoria: cada respuesta crea un job asíncrono, escribe automáticamente un archivo en `outputs/`, y se pierde al navegar. El usuario necesita una experiencia tipo ChatGPT — conversaciones persistentes sobre su base de conocimiento, historial de sesiones recuperable, y la opción (no obligación) de guardar una conversación en el vault.

## What Changes

- La pantalla `/chat` se convierte en un chat de sesiones: sidebar con historial de conversaciones + área de mensajes estilo ChatGPT.
- Las respuestas dejan de encolarse como jobs asíncronos: pasan por un endpoint directo `/api/chat/sessions/{id}/messages` con streaming SSE.
- El backend deja de escribir archivos automáticamente en `outputs/` para cada respuesta.
- Se añade un botón "Guardar en vault" por sesión para ingesta opcional de la conversación como nota markdown.
- Las sesiones de chat se persisten en base de datos (nueva tabla `chat_sessions` + `chat_messages`).
- Se añade historial: lista de sesiones pasadas navegable en sidebar, cada una con título y fecha.

## Capabilities

### New Capabilities

- `chat-session-persistence`: Gestión de sesiones de chat (crear, listar, recuperar, borrar) con mensajes almacenados en BD.
- `chat-direct-answer`: Endpoint de respuesta directa sin job queue, con soporte de historial de mensajes como contexto.
- `chat-session-vault-export`: Exportar una sesión de chat completa al vault como nota markdown (acción opcional del usuario).
- `chat-session-ui`: UI de pantalla `/chat` tipo ChatGPT: sidebar con lista de sesiones, área de mensajes con burbujas usuario/asistente.

### Modified Capabilities

- `enrich-links-workflow`: No aplica — el answer pipeline deja de producir artefactos de output automáticamente (se convierte en función interna reutilizable, no cambia el spec del workflow de enriquecimiento).

## Impact

- **Backend**: Nueva migración Flyway (`chat_sessions`, `chat_messages`). Nuevo `ChatSessionController`. Nuevo `ChatSessionService`. Refactor de `AnswerPipelineService` para extraer la lógica de respuesta como función pura sin escritura de archivo.
- **Frontend**: Reescritura completa de `chat.component.ts`. Nuevo servicio `ChatSessionApiService`. Las traducciones del namespace `chat.*` se amplían.
- **API**: Nuevos endpoints REST en `/api/chat/sessions`. El endpoint existente `/api/answer` permanece para el bot de Telegram.
- **Sin breaking changes** para el resto del sistema: el review de candidatos de conexión en `/review` no se toca.
