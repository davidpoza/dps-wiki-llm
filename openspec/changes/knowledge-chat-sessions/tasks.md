## 1. Base de datos — Migración Flyway

- [x] 1.1 Crear `V10__chat_sessions.sql` con tablas `chat_sessions` (id UUID PK, user_id FK, title varchar(60), created_at, updated_at) y `chat_messages` (id UUID PK, session_id FK, role varchar(16), content text, created_at)

## 2. Backend — Dominio y repositorio

- [x] 2.1 Crear `ChatSession.java` en `domain/` con campos: id, userId, title, createdAt, updatedAt
- [x] 2.2 Crear `ChatMessage.java` en `domain/` con campos: id, sessionId, role (enum USER/ASSISTANT), content, createdAt
- [x] 2.3 Crear `ChatSessionRepository.java` con métodos: `create`, `findById`, `findByUserId` (lista sin mensajes), `delete`
- [x] 2.4 Crear `ChatMessageRepository.java` con métodos: `create`, `findBySessionId` (orden cronológico)

## 3. Backend — Servicio de chat directo

- [x] 3.1 Crear `ChatSessionService.java` con métodos `createSession`, `getSession`, `listSessions`, `deleteSession`, `addMessage`
- [x] 3.2 Implementar en `ChatSessionService.addMessage` la lógica: (1) persistir mensaje de usuario, (2) recuperar historial reciente (ventana por chars), (3) búsqueda semántica, (4) construir prompt con historial + contexto KB, (5) llamar `LlmClient`, (6) persistir mensaje asistente, (7) devolver ambos mensajes
- [x] 3.3 Crear `ChatSessionVaultExportService.java` con método `exportToVault(sessionId, userId)` que genere `outputs/chat-{date}-{slug}.md` con el formato Q&A definido en el spec

## 4. Backend — DTOs y Controller

- [x] 4.1 Crear `ChatSessionDto.java` (id, title, createdAt, updatedAt) para listado sin mensajes
- [x] 4.2 Crear `ChatSessionDetailDto.java` (id, title, createdAt, updatedAt, messages: List<ChatMessageDto>)
- [x] 4.3 Crear `ChatMessageDto.java` (id, sessionId, role, content, createdAt)
- [x] 4.4 Crear `SendMessageRequest.java` (content: String)
- [x] 4.5 Crear `ChatSessionController.java` con endpoints:
  - `POST /api/chat/sessions` → crear sesión vacía, devolver `ChatSessionDto`
  - `GET /api/chat/sessions` → listar sesiones del usuario autenticado
  - `GET /api/chat/sessions/{id}` → detalle con mensajes
  - `DELETE /api/chat/sessions/{id}` → borrar sesión
  - `POST /api/chat/sessions/{id}/messages` → enviar mensaje y recibir respuesta (user + assistant)
  - `POST /api/chat/sessions/{id}/export-to-vault` → exportar al vault, devolver path

## 5. Frontend — Servicio API de chat

- [x] 5.1 Crear `chat-session.service.ts` en `services/` con métodos: `listSessions()`, `getSession(id)`, `createSession()`, `deleteSession(id)`, `sendMessage(id, content)`, `exportToVault(id)`
- [x] 5.2 Definir interfaces TypeScript: `ChatSession`, `ChatMessage`, `ChatSessionDetail` en `types.ts` o un archivo dedicado

## 6. Frontend — Componente chat refactorizado

- [x] 6.1 Reescribir `chat.component.ts` con layout two-panel: sidebar (lista de sesiones) + panel principal (mensajes)
- [x] 6.2 Implementar sidebar: lista de sesiones con título y fecha relativa, botón "Nueva conversación", opción de borrar sesión
- [x] 6.3 Implementar área de mensajes: burbujas usuario (derecha) + asistente (izquierda), indicador de carga mientras espera respuesta
- [x] 6.4 Implementar input area: textarea auto-resize, botón enviar, shortcut Ctrl+Enter, deshabilitado mientras carga
- [x] 6.5 Renderizar markdown en mensajes del asistente (usar `marked` o `ngx-markdown` si ya disponible, o aplicar clase con `[innerHTML]` y pipe de sanitización)
- [x] 6.6 Añadir botón "Guardar en vault" en la cabecera del panel, visible solo cuando hay mensajes; mostrar path de confirmación o error tras la acción
- [x] 6.7 Hacer el sidebar colapsable en mobile (botón toggle, overlay)

## 7. Internacionalización

- [x] 7.1 Añadir/actualizar claves de traducción en `es.json` y `en.json` para los nuevos literales de la pantalla chat (sidebar, botones, estados, errores)

## 8. Verificación E2E

- [ ] 8.1 Verificar en la app que crear una nueva conversación, enviar una pregunta y recibir respuesta funciona correctamente
- [ ] 8.2 Verificar que el historial de sesiones persiste tras recargar la página
- [ ] 8.3 Verificar que seleccionar una sesión pasada carga el historial de mensajes
- [ ] 8.4 Verificar que el botón "Guardar en vault" crea el archivo y muestra el path
- [ ] 8.5 Verificar que borrar una sesión la elimina del sidebar
- [ ] 8.6 Verificar que el bot de Telegram sigue funcionando con el endpoint `/api/answer` sin cambios
