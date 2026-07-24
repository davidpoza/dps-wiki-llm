## Why

El Health Check actualmente se lanza siempre sobre el vault completo. No hay forma de ejecutarlo de forma selectiva sobre un subconjunto de notas, lo que lo hace lento e innecesariamente costoso cuando el usuario solo quiere reconciliar una carpeta o un grupo concreto de conceptos. La pantalla de configuración ya expone una selección parcial de ficheros para regenerar keywords; tiene sentido replicar ese mismo patrón para el Health Check.

## What Changes

- Se añade un modal de selección de notas para el Health Check, análogo a `KeywordSelectionModalComponent`, que permite elegir las notas sobre las que se ejecutará la fase 2 (descubrimiento de conexiones).
- Se añade un nuevo endpoint SSE en el backend `GET /api/settings/health-check/partial` que acepta uno o más parámetros `paths` por query string y ejecuta el Health Check restringido a esas rutas en la fase 2.
- `HealthCheckService` se extiende con un método sobrecargado que acepta una lista de rutas para filtrar los documentos procesados en la fase 2.
- En la sección Health Check de la pantalla de configuración se añade un botón secundario "Seleccionar notas…" junto al botón actual "Lanzar Health Check", siguiendo el mismo patrón visual que la sección de keywords.

## Capabilities

### New Capabilities

- `health-check-partial`: Ejecución parcial del Health Check sobre un subconjunto de notas seleccionado desde un modal con búsqueda, agrupación por carpeta y checkboxes. Incluye el modal Angular y el endpoint backend de soporte.

### Modified Capabilities

- `vault-health-check`: El requisito de que el Health Check opera siempre sobre todo el vault se relaja: ahora puede también ejecutarse en modo parcial, limitando la fase 2 a las notas seleccionadas por el usuario.

## Impact

- **Frontend**: nuevo componente `HealthCheckSelectionModalComponent`; cambios en `settings.component.ts` para mostrar el botón y el modal.
- **Backend**: nuevo método en `HealthCheckService`; nuevo endpoint en `SettingsController`.
- **API**: nueva ruta `GET /api/settings/health-check/partial?paths=...` (SSE).
- **No hay breaking changes**: el endpoint `GET /api/settings/health-check` existente permanece sin cambios.
