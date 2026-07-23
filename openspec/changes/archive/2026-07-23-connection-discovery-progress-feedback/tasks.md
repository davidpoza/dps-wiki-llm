## 1. Backend: inyectar JobLifecycleService en ConnectionDiscoveryService

- [x] 1.1 Añadir `JobLifecycleService` como dependencia en el constructor de `ConnectionDiscoveryService`
- [x] 1.2 Calcular el total de ficheros a evaluar antes de los bucles: `int total = llmUpdateActions.size() + semanticResults.size()` (donde `semanticResults` son los resultados pre-filtrados de threshold)
- [x] 1.3 Emitir `lifecycleService.progress(job, "connection-discovery-scan", action.path(), "{\"current\":" + idx + ",\"total\":" + total + "}")` en el bucle de sugerencias LLM con contador 1-based
- [x] 1.4 Emitir `lifecycleService.progress(job, "connection-discovery-scan", result.path(), "{\"current\":" + idx + ",\"total\":" + total + "}")` en el bucle de resultados semánticos para cada resultado que pase el filtro de score y no sea el fichero fuente, continuando el contador

## 2. Frontend: añadir `currentActivity` a JobState

- [x] 2.1 Añadir tipo `ScanActivity { path: string; percent: number }` y campo `currentActivity?: ScanActivity | null` al tipo `JobState` en `frontend/src/app/types.ts`
- [x] 2.2 En `JobsStore.handleEvent()`, detectar eventos con `event.step` terminado en `-scan`: parsear `event.result` como `{ current, total }`, calcular `percent = Math.round((current/total)*100)`, y actualizar `currentActivity = { path: event.message, percent }` en lugar de añadir a `phases`
- [x] 2.3 En `JobsStore.handleEvent()`, limpiar `currentActivity = null` al recibir cualquier evento terminal (COMPLETED, FAILED, REVERTED)

## 3. Frontend: mostrar el indicador de scanning en jobs-viewer

- [x] 3.1 En `jobs-viewer.component.ts`, añadir bloque `@if (job.currentActivity)` debajo del listado de fases que muestre etiqueta "scanning", el path en monospace, y el porcentaje en formato `(23%)`
- [x] 3.2 Añadir estilos CSS para el indicador: label muted + path monospace + porcentaje muted, visualmente diferente de las fases normales
