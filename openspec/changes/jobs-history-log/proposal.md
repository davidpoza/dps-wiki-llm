## Why

La pantalla de jobs solo muestra los trabajos activos en la sesión actual (recibidos vía SSE). Al refrescar la página o abrir el panel más tarde, el historial desaparece. Los usuarios necesitan ver un log persistente de todos los jobs ejecutados para auditoría, diagnóstico y seguimiento.

## What Changes

- Nuevo endpoint `GET /jobs` en el backend que devuelve la lista de jobs recientes ordenados por `created_at DESC`.
- El `JobsStore` del frontend carga el historial al inicializarse, fusionando los jobs pasados con los eventos SSE en tiempo real.
- La pantalla de jobs muestra todos los jobs (históricos + en curso), con timestamps visibles para contexto temporal.

## Capabilities

### New Capabilities
- `jobs-history`: Capacidad de listar todos los jobs ejecutados (con sus estados finales, fases y archivos afectados) desde la base de datos, mostrándolos como log persistente en la pantalla de jobs.

### Modified Capabilities

## Impact

- **Backend**: `JobController` — nuevo endpoint REST `GET /jobs`. `JobRepository` — nuevo método de consulta.
- **Frontend**: `JobsStore` — inicialización con fetch HTTP + merge con SSE. `JobsViewerComponent` — mostrar timestamps.
- **No breaking changes**: el endpoint SSE y el endpoint `GET /jobs/{id}` existente no se modifican.
