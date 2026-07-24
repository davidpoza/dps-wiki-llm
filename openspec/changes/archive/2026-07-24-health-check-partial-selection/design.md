## Context

La pantalla de configuración tiene dos tipos de operaciones:

1. **Operaciones SSE sincrónicas** (con feedback de progreso en tiempo real): reindex, health-check, broken-links/scan. Usan `GET` → SSE stream; el botón se desactiva mientras corre.
2. **Operaciones asíncronas de job queue**: keyword regeneration. Usan `POST` → respuesta inmediata con job ID; el progreso se consulta en el historial.

El Health Check actual (`GET /api/settings/health-check`) es SSE. Tiene dos fases:
- **Fase 1** (`reindexWiki` + `embedIncremental`): siempre sobre todo el vault.
- **Fase 2** (`discoverConnections`): itera sobre todas las notas de `wiki/concepts` y `wiki/sources`.

El modal de selección de keywords (`KeywordSelectionModalComponent`) usa el modelo job-queue: muestra la lista, el usuario selecciona, pulsa confirmar y se encola el job. El modal cierra con un enlace al historial.

Para el health-check parcial conviene mantener el modelo SSE (el usuario quiere feedback de progreso inmediato, no diferido al historial de jobs). La selección de notas ocurre en un modal, y cuando el usuario confirma, el modal pasa a mostrar el progreso SSE en lugar de cerrarse como hace el modal de keywords.

## Goals / Non-Goals

**Goals:**
- Permitir al usuario seleccionar un subconjunto de notas sobre las que ejecutar la fase 2 del Health Check.
- Mantener la fase 1 (embeddings) sin cambios — siempre incremental sobre todo el vault.
- Reutilizar el patrón de UI del `KeywordSelectionModalComponent`: búsqueda, agrupación por carpeta, checkboxes, seleccionar todo / deseleccionar todo.
- Feedback de progreso SSE en tiempo real dentro del mismo modal.
- No romper el endpoint ni la UI actuales del Health Check completo.

**Non-Goals:**
- Convertir el health-check parcial en job asíncrono (no es necesario; SSE es suficiente y más inmediato).
- Filtrar también la fase 1 (embeddings) — se ejecuta siempre completa porque es incremental y necesaria para que la fase 2 tenga embeddings al día.
- Guardar la selección entre sesiones.

## Decisions

### 1. Endpoint: GET con query params `paths` vs POST

**Decisión:** `GET /api/settings/health-check/partial?paths=wiki/concepts/foo&paths=wiki/sources/bar`

**Rationale:** SSE requiere `GET`. Pasar `paths` como repeated query params es la aproximación estándar para listas en GET. Los paths son rutas relativas del vault (máx ~80 chars cada una); en los tamaños habituales (selección de 5-50 notas) la URL no supera ningún límite práctico. Evita la complejidad de un two-step POST+SSE o de WebSocket.

**Alternativa descartada:** POST body + SSE — no soportado nativamente por `EventSource` del browser; requeriría fetch con ReadableStream o una librería externa.

### 2. Modelo de progreso en el modal

**Decisión:** El modal tiene cinco fases: `loading` → `ready` → `running` → `done` | `error`.

- `loading`: carga la lista de notas.
- `ready`: el usuario selecciona notas.
- `running`: se muestra la barra de progreso SSE (mismas métricas que el health-check completo: phase, processed/total, embeddings, connections).
- `done`: resumen del resultado con botón cerrar.
- `error`: mensaje de error con opción de reintentar.

**Rationale:** Reutiliza exactamente la misma estructura de feedback que ya tiene `startHealthCheck()` en el settings component, pero dentro del modal. El usuario no necesita salir del modal para ver el resultado.

### 3. Modificación de `HealthCheckService`

**Decisión:** Añadir un método sobrecargado `run(List<String> paths, Consumer<HealthCheckProgress> onProgress)` que en la fase 2 filtra los documentos procesados a los que aparecen en `paths`. La fase 1 (embeddings) permanece sin cambios.

**Rationale:** Mínimo cambio al servicio existente. El método sin paths existente `run(Consumer)` sigue siendo el entry point del health-check completo; el nuevo método reutiliza `discoverConnections` con un predicado de filtrado adicional.

**Alternativa descartada:** Pasar `Set<String>` vacío = todo el vault. Semánticamente confuso; mejor tener dos métodos con firmas claras.

### 4. Nuevo endpoint en `SettingsController` vs `HealthCheckController` separado

**Decisión:** Añadir `GET /settings/health-check/partial` en el `SettingsController` existente.

**Rationale:** El health-check completo ya vive en `SettingsController`. Mantener los dos endpoints juntos es más cohesivo y evita crear un nuevo controller para un único endpoint.

### 5. Nuevo componente Angular vs reutilizar `KeywordSelectionModalComponent`

**Decisión:** Nuevo componente `HealthCheckSelectionModalComponent` independiente.

**Rationale:** El comportamiento post-selección es diferente (SSE en el modal vs encolar job y cerrar). Reutilizar el componente de keywords requeriría abstracciones forzadas. Copiar la estructura de UI (búsqueda, carpetas, checkboxes) y adaptar las fases es más limpio y mantenible.

## Risks / Trade-offs

- **URLs largas con muchos paths**: Si el usuario selecciona >200 notas los query params pueden crecer. Mitigation: en la práctica los vaults tienen decenas de notas en concepts+sources, no cientos. Si se detecta el problema, migrar a POST two-step (guardar selección temporalmente) es un cambio aislado al endpoint.
- **Concurrencia con health-check completo**: No hay mutex entre los dos endpoints. Mitigation: aceptado por diseño — igual que hoy el botón completo no tiene mutex global. El usuario raramente ejecuta ambos a la vez desde tabs distintos.
- **Fase 1 siempre completa**: El usuario puede sorprenderse de que la fase de embeddings no se filtre. Mitigation: se aclara en el texto descriptivo del modal.
