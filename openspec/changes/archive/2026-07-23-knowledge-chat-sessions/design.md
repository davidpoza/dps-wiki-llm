## Context

La pantalla `/chat` actual funciona sobre el job queue: cada pregunta crea un `Job` de tipo `ANSWER`, el `AnswerPipelineService` lo procesa de forma asíncrona, escribe un archivo en `outputs/`, y el frontend hace polling vía SSE de eventos. Esto añade latencia innecesaria, complejidad de estado, y outputs no deseados para un caso de uso conversacional interactivo.

El stack es Spring Boot 3 + JDBC puro (sin JPA/Hibernate) + Angular 18/PrimeNG en el frontend. Los datos se almacenan en Postgres con migraciones Flyway. El LLM se llama vía `LlmClient` (interfaz sobre `OpenAiCompatibleLlmClient`). La autenticación usa Spring Security con JWT.

## Goals / Non-Goals

**Goals:**
- Persistencia de sesiones y mensajes de chat en Postgres
- Endpoint síncrono de respuesta que reutilice la lógica de búsqueda semántica + LLM sin enqueue de job
- Exportación opcional al vault como nota markdown
- UI tipo ChatGPT en `/chat`: sidebar con historial + área de mensajes con burbujas

**Non-Goals:**
- Streaming SSE de tokens (la respuesta llega completa — simplifica el frontend considerablemente)
- Compartir sesiones entre usuarios
- Búsqueda dentro del historial de chats
- Modificar o borrar mensajes individuales
- Cambiar el endpoint `/api/answer` ni el comportamiento del bot de Telegram

## Decisions

### D1: Respuesta síncrona en lugar de streaming SSE
**Decisión**: El endpoint `POST /api/chat/sessions/{id}/messages` bloquea hasta que el LLM responde y devuelve el mensaje completo.  
**Por qué**: La llamada al LLM ya tarda 2-8s. Añadir streaming requiere gestión de estado compleja en el frontend (chunks parciales, reconexión). Dado que el LLM no soporta streaming configurable en el cliente actual, la respuesta síncrona es equivalente en UX con mucho menos código.  
**Alternativa descartada**: SSE streaming token a token — requiere cambiar `LlmClient` para devolver `Flux<String>` y el frontend para acumular chunks.

### D2: JDBC puro, sin JPA, para las nuevas entidades
**Decisión**: `ChatSession` y `ChatMessage` se gestionan con `JdbcTemplate`/`NamedParameterJdbcTemplate`, igual que el resto del codebase.  
**Por qué**: Consistencia con el patrón existente (el proyecto no usa JPA). Añadir JPA solo para estas dos tablas introduciría una dependencia nueva y un patrón divergente.

### D3: Historial de conversación en el contexto del LLM (ventana deslizante)
**Decisión**: Se incluyen los últimos N turnos (user+assistant) en el prompt, donde N se calcula para no exceder `MAX_CONTEXT_CHARS / 2` (la mitad del presupuesto, la otra mitad para el contexto del knowledge base).  
**Por qué**: Permite al asistente responder preguntas de seguimiento ("¿puedes ampliar eso?"). Sin un límite, sesiones largas harían explotar el context window del LLM.  
**Alternativa descartada**: Enviar siempre toda la historia — costoso e impredecible para sesiones largas.

### D4: Título auto-generado desde el primer mensaje
**Decisión**: El título de la sesión se toma de los primeros 60 caracteres del primer mensaje del usuario (sin llamar al LLM para generarlo).  
**Por qué**: Simple, inmediato, sin coste adicional de LLM. El usuario puede identificar la sesión por el inicio de su primera pregunta.  
**Alternativa descartada**: Llamar al LLM para generar un título resumen — añade latencia y coste en cada nueva sesión.

### D5: UI two-panel en el mismo componente (no rutas hijas)
**Decisión**: La pantalla `/chat` usa un layout de dos columnas dentro de `chat.component.ts`: sidebar (lista de sesiones) + panel principal (mensajes). No se crean rutas hijas como `/chat/:sessionId`.  
**Por qué**: Simplifica el routing. El estado de sesión activa se gestiona en el componente. El URL de `/chat` no cambia al seleccionar una sesión, lo que evita problemas con el router al crear nueva sesión.  
**Alternativa descartada**: `/chat/:sessionId` como ruta hija — más semántica pero requiere guards y lógica de redirección al crear nueva sesión.

### D6: Export al vault genera path determinístico
**Decisión**: El path del archivo exportado es `outputs/chat-{YYYY-MM-DD}-{title-slug}.md`.  
**Por qué**: Permite reexportar la misma sesión sin duplicados. El usuario puede actualizar su nota en el vault refleje el estado más reciente de la conversación.

## Risks / Trade-offs

- **Respuesta síncrona bloquea el hilo HTTP**: En Tomcat con el número por defecto de threads, peticiones largas al LLM (8s+) reducen la concurrencia. → Mitigación: timeout configurable en `LlmClient`; el número de usuarios simultáneos del chat es bajo (app personal).
- **Sin paginación en el historial de sesiones**: Si el usuario acumula cientos de sesiones, la lista completa puede ser lenta. → Mitigación: limitar a las últimas 100 sesiones en la primera versión; paginación como mejora futura.
- **Ventana de historial fija por caracteres, no tokens**: La estimación del contexto usa caracteres, no tokens reales. Podría inflar ligeramente el prompt. → Mitigación: el presupuesto es conservador (mitad del MAX_CONTEXT_CHARS existente = ~6000 chars ≈ 1500 tokens, bien dentro del context window).

## Migration Plan

1. Nueva migración Flyway `V10__chat_sessions.sql` crea `chat_sessions` y `chat_messages`.
2. Las nuevas clases Java (`ChatSession`, `ChatMessage`, `ChatSessionRepository`, `ChatSessionService`, `ChatSessionController`) son aditivas — no tocan código existente.
3. El frontend reemplaza el contenido de `chat.component.ts` — no hay datos en sesión que migrar (el historial actual se pierde, pero era solo in-memory).
4. Rollback: eliminar las nuevas tablas con `DROP TABLE chat_messages; DROP TABLE chat_sessions;` y revertir el componente.

## Open Questions

- ¿Debe el endpoint de mensajes devolver solo el mensaje del asistente, o también el mensaje del usuario persistido? → Propuesta: devolver ambos para que el frontend no tenga que mantener una copia local del mensaje de usuario enviado.
- ¿Límite máximo de sesiones por usuario? → No en esta versión; se implementará si hay necesidad.
