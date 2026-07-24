# concept-dedup-ui Specification

## Purpose
TBD - created by archiving change merge-duplicate-concepts. Update Purpose after archive.
## Requirements
### Requirement: Botón "Find duplicate concepts" en la pantalla Settings
La pantalla Settings SHALL mostrar una sección de mantenimiento con un botón "Find duplicate concepts". Al hacer clic, SHALL abrirse un modal de deduplicación. El botón SHALL mostrarse deshabilitado mientras un job MERGE esté en estado QUEUED o STARTED.

#### Scenario: Botón visible en Settings
- **WHEN** el usuario navega a la pantalla Settings
- **THEN** aparece un botón "Find duplicate concepts" en una sección de mantenimiento

#### Scenario: Botón deshabilitado con job MERGE activo
- **WHEN** hay un job de tipo MERGE con estado QUEUED o STARTED
- **THEN** el botón aparece deshabilitado con tooltip "A merge job is already running"

### Requirement: Modal de escaneo con progreso SSE en tiempo real
Al abrir el modal, el sistema SHALL conectarse automáticamente a `GET /api/concept-dedup/scan` vía SSE y mostrar el progreso del escaneo: barra de progreso con porcentaje, nombre del fichero actualmente evaluado, y contador "n / m concepts evaluated". El modal SHALL mostrar un estado de "Scanning…" mientras el SSE esté activo.

#### Scenario: Modal muestra progreso por fichero
- **WHEN** el backend emite un evento PROGRESS con `step = "concept-dedup-scan"` y `result = {"current":12,"total":87}`
- **THEN** el modal actualiza la barra de progreso al 14%, muestra el filepath del event.message y el texto "12 / 87 concepts"

#### Scenario: Advertencia de concept sin embedding
- **WHEN** el backend emite un evento PROGRESS con `step = "concept-dedup-warning"`
- **THEN** el modal muestra el path con un icono de advertencia en una lista de advertencias visible debajo de la barra

#### Scenario: Error de conexión SSE
- **WHEN** la conexión SSE se pierde antes de recibir COMPLETED
- **THEN** el modal muestra un mensaje de error "Scan failed. Please try again." y un botón "Retry"

### Requirement: Modal de resultados con lista de merges seleccionables
Cuando el SSE emite el evento COMPLETED, el modal SHALL transicionar a la fase de resultados mostrando los grupos candidatos. Cada grupo SHALL mostrarse como un ítem con: checkbox, lista de ficheros a fusionar, flecha "→", canonical filename editable. Si no hay grupos, el modal muestra "No duplicate concepts found".

#### Scenario: Grupos mostrados con checkbox
- **WHEN** el escaneo completa con 3 grupos candidatos
- **THEN** el modal muestra 3 ítems, cada uno con un checkbox marcado por defecto, los slugs de los ficheros del grupo, y el canonical filename propuesto

#### Scenario: Canonical filename editable
- **WHEN** el usuario hace clic sobre el canonical filename de un grupo
- **THEN** el campo se convierte en un input de texto editable que acepta slugs kebab-case

#### Scenario: Sin duplicados encontrados
- **WHEN** el escaneo completa con `{"groups":[]}`
- **THEN** el modal muestra el texto "No duplicate concepts found." y un único botón "Close"

### Requirement: Confirmación lanza el job MERGE
El modal SHALL mostrar un botón "Merge selected" habilitado solo cuando hay al menos un checkbox marcado. Al hacer clic, el modal SHALL deshabilitar el botón, hacer `POST /api/jobs` con `type = MERGE` y los grupos seleccionados (usando el canonical filename editado si el usuario lo modificó), y mostrar una confirmación con el job id y un enlace al historial de jobs.

#### Scenario: Merge selected lanza el job
- **WHEN** el usuario tiene 2 de 3 grupos marcados y hace clic en "Merge selected"
- **THEN** el frontend envía `POST /api/jobs` con los 2 grupos seleccionados, el modal muestra "Merge job enqueued. Job #42." y un botón "View in jobs history"

#### Scenario: Botón Merge selected deshabilitado sin selección
- **WHEN** el usuario desmarca todos los checkboxes
- **THEN** el botón "Merge selected" queda deshabilitado

#### Scenario: Todos los grupos seleccionados por defecto
- **WHEN** el modal transiciona a la fase de resultados
- **THEN** todos los checkboxes están marcados por defecto

