## Context

El pipeline de ingest procesa documentos en múltiples pasos. El paso `connection-discovery` tiene dos fases internas:
1. **LLM suggestions**: itera las acciones del plan LLM buscando candidatos de tipo `update`.
2. **Semantic search**: llama a `SemanticSearchService.search()` que devuelve una lista de resultados por similitud, luego itera esa lista filtrando por score.

Actualmente ambas fases son silenciosas desde el punto de vista del usuario: el frontend solo recibe el mensaje estable "Requesting optional connection plan" al inicio del paso, y ningún feedback posterior hasta que el job avanza al siguiente paso.

La infraestructura SSE ya soporta eventos `PROGRESS` con campos `step` y `message`. `JobLifecycleService.progress()` no escribe en DB, solo emite el broadcast, lo que lo hace adecuado para eventos de alta frecuencia.

## Goals / Non-Goals

**Goals:**
- Emitir un evento SSE por cada fichero evaluado durante la fase de semantic search de `connection-discovery`.
- Emitir un evento SSE por cada sugerencia LLM evaluada.
- El frontend muestra el fichero activo en tiempo real como indicador de "scanning" (sin acumular entradas en el historial de fases).

**Non-Goals:**
- No se modifica el contrato del DTO `JobEvent` (ya tiene `step` y `message`).
- No se persiste nada en base de datos adicional.
- No se cambia el comportamiento de otros pasos del pipeline.
- No se añade progress para la fase de embedding (está dentro de `SemanticSearchService` y es atómica).

## Decisions

### 1. Nombre de step: `connection-discovery-scan` para eventos transitorios

**Decisión**: Los eventos de scanning per-fichero usan `step = "connection-discovery-scan"`. Los mensajes de fase estables siguen usando `step = "connection-discovery"`.

**Alternativas consideradas**:
- Usar el mismo step `"connection-discovery"` para todo → el frontend no puede distinguir "fase iniciada" de "fichero en curso", y acumularía todas las entradas en el historial.
- Añadir un campo booleano `transient` al `JobEvent` → requiere cambiar el DTO y el contrato SSE.

**Rationale**: El sufijo `-scan` es una convención ligera que no requiere cambios de contrato. El frontend detecta el patrón y sabe que debe sobreescribir en lugar de acumular.

### 2. Lugar de inyección: `ConnectionDiscoveryService` recibe `JobLifecycleService`

**Decisión**: Se inyecta `JobLifecycleService` en `ConnectionDiscoveryService` via constructor.

**Alternativas consideradas**:
- Emitir los eventos desde `IngestPipelineService` (el orquestador) → requeriría refactorizar `discoverAndPersist()` para devolver resultados intermedios o aceptar un callback, complicando la API.
- Crear un `ProgressCallback` funcional → añade abstracción innecesaria para un caso tan concreto.

**Rationale**: `ConnectionDiscoveryService` ya recibe `Job` como parámetro, y es quien itera los ficheros. La inyección directa es la solución más sencilla.

### 3. Frontend: campo `currentActivity` en `JobState`

**Decisión**: Se añade `currentActivity: string | null` a `JobState`. El store lo actualiza al recibir eventos con step que termina en `-scan`. El viewer lo muestra como una línea de "scanning" animada.

**Alternativas consideradas**:
- Acumular todos los eventos de scanning como fases normales → inunda el historial con 8+ entradas transitorias.
- Reemplazar la última fase con el mismo step → lógica frágil; los steps de fase pueden repetirse por otras razones.

**Rationale**: Un campo dedicado `currentActivity` es semánticamente preciso: representa "lo que está ocurriendo ahora" y no forma parte del historial de fases completadas. Se limpia automáticamente al terminar el job.

### 4. Scope de eventos: incluir tanto LLM suggestions como semantic results

**Decisión**: Se emiten eventos para ambas fuentes (LLM y semantic).

**Rationale**: Coherencia de UX — el usuario ve progreso durante toda la fase, no solo durante el semantic search.

## Risks / Trade-offs

- **Volumen de eventos**: Se emiten hasta 8 eventos de semantic + N de LLM en ráfaga corta. El SSE broadcast es synchronous en el hilo del consumer RabbitMQ. Con N pequeño (≤ 15) y payloads mínimos, el impacto en throughput es despreciable. → Mitigación: no se añade ningún sleep ni throttle; si en el futuro el volumen crece, se puede añadir debounce en el frontend.
- **Circular dependency**: `ConnectionDiscoveryService` depende de `JobLifecycleService`, que depende de `JobEventService`. Ninguno depende de `ConnectionDiscoveryService`. Sin riesgo de ciclo. → Sin mitigación necesaria.
- **`currentActivity` stale**: Si el cliente SSE pierde conexión justo cuando hay un evento de scan activo y el job termina sin que el cliente lo reciba, `currentActivity` podría quedar visible. → Mitigación: el store limpia `currentActivity` al recibir cualquier evento terminal (COMPLETED, FAILED, etc.).
