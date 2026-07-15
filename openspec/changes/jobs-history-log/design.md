## Context

La pantalla de jobs usa un `JobsStore` Angular que solo acumula jobs en memoria durante la sesión actual, recibidos por SSE. Al conectarse, el store empieza vacío: no hay ninguna carga inicial desde la base de datos. Los jobs terminales (COMPLETED, FAILED, REVERTED) persisten en la tabla `jobs` de PostgreSQL con timestamps completos (`created_at`, `started_at`, `completed_at`).

El backend expone `GET /jobs/{id}` (por job individual) pero no tiene endpoint para listar todos los jobs. El `JobRepository` tiene `findByCreatedAtAfterOrderByCreatedAtAsc` que puede adaptarse fácilmente.

## Goals / Non-Goals

**Goals:**
- Añadir `GET /jobs` en el backend que devuelva los jobs recientes (últimas 24h o últimos N jobs).
- Cargar el historial al inicializar el `JobsStore` y fusionarlo con los eventos SSE.
- Mostrar timestamps (`createdAt`) en cada job card del viewer.

**Non-Goals:**
- Paginación avanzada o filtros por estado/tipo (fuera de scope inicial).
- Persistir las fases (steps) de ejecución en la DB — solo se ven en tiempo real vía SSE; en el historial se muestra el estado final.
- Cambios en la autenticación o autorización del endpoint.

## Decisions

### 1. Endpoint: `GET /jobs` devuelve los últimos 50 jobs

**Decisión**: Devolver los jobs ordenados por `created_at DESC`, limitados a 50.

**Rationale**: Un límite razonable evita cargar miles de registros al abrir el panel. 50 jobs cubre semanas de uso normal. No requiere paginación en MVP.

**Alternativas descartadas**:
- Filtrar por últimas 24h: el límite temporal es arbitrario; si no hay actividad en 24h el log aparece vacío.
- Paginación: añade complejidad innecesaria para un panel de monitoreo.

### 2. Merge SSE + historial: los eventos SSE sobreescriben al historial

**Decisión**: Al recibir un evento SSE para un jobId ya presente (del historial), se actualiza el registro existente.

**Rationale**: Garantiza que los jobs activos siempre muestren el estado más reciente. Si un job del historial reaparece (e.g., REVERT de un job antiguo), el SSE lo actualiza correctamente.

### 3. Fetch del historial al conectar el SSE

**Decisión**: El `JobsStore.connect()` dispara un HTTP GET a `/api/jobs` antes (o en paralelo) de abrir el EventSource.

**Rationale**: Un único punto de inicialización. El historial se carga una sola vez; los SSE mantienen el estado en tiempo real. No se necesita polling.

### 4. DTO `JobSummary` en lugar de exponer la entidad `Job` directamente

**Decisión**: Crear un DTO `JobSummary` con los campos necesarios para el listado (id, type, status, createdAt, completedAt, error).

**Rationale**: La entidad `Job` contiene campos internos (`payloadRef`, `preGitSha`, `affectedPaths` como JSON string) que no deben exponerse al cliente tal cual. Además, `affectedPaths` ya está representado como `files` en el frontend.

## Risks / Trade-offs

- **[Risk] Los jobs muy antiguos no se ven** → Mitigation: el límite de 50 es configurable en el futuro; la mayoría de uso es reciente.
- **[Risk] El historial no incluye fases de ejecución** → Mitigation: se muestra claramente solo el estado final + archivos afectados (presentes en la DB como `affectedPaths`). Las fases en tiempo real siguen siendo visibles via SSE.
- **[Risk] Race condition: SSE llega antes que el GET /jobs responda** → Mitigation: la fusión es idempotente; el SSE siempre sobreescribe/enriquece, nunca elimina datos del historial.
