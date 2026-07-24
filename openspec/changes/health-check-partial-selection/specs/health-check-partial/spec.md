## ADDED Requirements

### Requirement: Modal de selección de notas para Health Check parcial

La pantalla de configuración SHALL ofrecer un botón secundario "Seleccionar notas…" en la sección Health Check que abre un modal con la lista de notas seleccionables para ejecutar el Health Check parcial.

#### Scenario: Abrir el modal de selección

- **WHEN** el usuario pulsa "Seleccionar notas…" en la sección Health Check
- **THEN** el sistema abre un modal con la lista de notas de `wiki/concepts` y `wiki/sources`
- **AND** las notas se muestran agrupadas por carpeta y ordenadas
- **AND** ninguna nota está seleccionada inicialmente

#### Scenario: Filtrar notas por texto

- **WHEN** el usuario escribe en el campo de búsqueda del modal
- **THEN** la lista de notas se filtra para mostrar solo las que coincidan con el texto en título o path
- **AND** la agrupación por carpeta se recalcula sobre el subconjunto filtrado

#### Scenario: Seleccionar todas las notas visibles

- **WHEN** el usuario pulsa "Seleccionar todo" en el modal
- **THEN** todas las notas actualmente visibles (que coincidan con el filtro de búsqueda) quedan marcadas como seleccionadas

#### Scenario: Deseleccionar todas las notas

- **WHEN** el usuario pulsa "Deseleccionar todo" en el modal
- **THEN** todas las notas quedan desmarcadas, independientemente del filtro activo

#### Scenario: Botón de confirmación desactivado sin selección

- **WHEN** ninguna nota está seleccionada
- **THEN** el botón de confirmación del modal está desactivado y no puede pulsarse

### Requirement: Ejecución del Health Check parcial con progreso en el modal

Al confirmar la selección, el sistema SHALL ejecutar el Health Check restringido a las notas seleccionadas y mostrar el progreso en tiempo real dentro del mismo modal.

#### Scenario: Lanzar el Health Check parcial

- **WHEN** el usuario ha seleccionado al menos una nota y pulsa el botón de confirmación
- **THEN** el modal transiciona al estado "running"
- **AND** el sistema inicia la llamada SSE a `GET /api/settings/health-check/partial?paths=...`
- **AND** se muestra el progreso de la fase 1 (embeddings) y la fase 2 (conexiones)

#### Scenario: Progreso de la fase 1 (embeddings)

- **WHEN** el Health Check parcial está en la fase de embeddings
- **THEN** el modal muestra "Generando embeddings X/Y (Z%)"

#### Scenario: Progreso de la fase 2 (conexiones)

- **WHEN** el Health Check parcial está en la fase de conexiones
- **THEN** el modal muestra "Buscando conexiones X/Y (Z%)"
- **AND** se actualizan los contadores de embeddings construidos y conexiones encontradas

#### Scenario: Health Check parcial completado

- **WHEN** el SSE emite el evento `done`
- **THEN** el modal transiciona al estado "done"
- **AND** muestra el resumen: embeddings construidos y conexiones encontradas

#### Scenario: Error durante el Health Check parcial

- **WHEN** el SSE emite el evento `error` o se pierde la conexión
- **THEN** el modal transiciona al estado "error"
- **AND** muestra un mensaje de error
- **AND** ofrece al usuario la opción de cerrar el modal

### Requirement: Endpoint backend para Health Check parcial

El sistema SHALL exponer el endpoint `GET /api/settings/health-check/partial` que acepta una lista de paths de notas como parámetros de consulta y ejecuta el Health Check restringiendo la fase 2 a esas notas.

#### Scenario: Petición con paths válidos

- **WHEN** se llama a `GET /api/settings/health-check/partial?paths=wiki/concepts/foo&paths=wiki/sources/bar`
- **THEN** el endpoint devuelve un stream SSE con eventos `progress` y `done`
- **AND** la fase 1 (embeddings) se ejecuta sobre todo el vault de forma incremental
- **AND** la fase 2 (conexiones) solo procesa las notas cuyos paths están en la lista recibida

#### Scenario: Petición sin paths

- **WHEN** se llama a `GET /api/settings/health-check/partial` sin parámetros `paths`
- **THEN** el endpoint devuelve un error 400 Bad Request

#### Scenario: Paths inexistentes ignorados graciosamente

- **WHEN** algún path de la lista no corresponde a ninguna nota del índice
- **THEN** el endpoint ignora ese path y procesa únicamente las notas que sí existen
- **AND** el proceso termina correctamente sin error
