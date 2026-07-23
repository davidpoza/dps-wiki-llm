## Why

Durante el paso `connection-discovery` del pipeline de ingest, el usuario no recibe ningún feedback visual de progreso: la UI simplemente muestra el paso como "en curso" sin indicar qué está haciendo internamente. Este paso puede durar varios segundos o incluso minutos en wikis grandes, ya que realiza búsqueda semántica contra todos los documentos de la base de conocimiento. Mostrar el fichero que se está analizando en cada momento reduce la incertidumbre del usuario y hace la experiencia mucho más transparente.

## What Changes

- El `ConnectionDiscoveryService` emitirá eventos SSE de progreso granular por cada fichero candidato que evalúe durante la búsqueda semántica.
- Cada evento incluirá el path del fichero que se está analizando en el campo `message` del evento `PROGRESS`.
- El frontend (`jobs-viewer`) renderizará estos mensajes de progreso inline dentro del paso `connection-discovery`, mostrando el fichero activo en tiempo real.

## Capabilities

### New Capabilities
- `connection-discovery-progress`: Emisión de eventos SSE granulares durante la búsqueda semántica de candidatos de conexión, con el path del fichero analizado en cada momento.

### Modified Capabilities

## Impact

- **Backend:** `ConnectionDiscoveryService.java` — añadir llamadas a `JobLifecycleService.transition()` con mensajes de progreso por fichero durante el bucle de semantic search.
- **Frontend:** `jobs-viewer.component.ts` — mostrar el mensaje de progreso activo del paso `connection-discovery` de forma destacada (p.ej. texto monospace actualizable).
- **Sin cambios en la API:** El DTO `JobEvent` ya soporta `step` y `message`; no se requieren cambios de contrato.
- **Sin cambios en base de datos.**
