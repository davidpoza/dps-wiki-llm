## MODIFIED Requirements

### Requirement: Ejecución del Health Check parcial con progreso en el modal

Al confirmar la selección, el sistema SHALL ejecutar el Health Check restringido a las notas seleccionadas encolando un job y mostrando el estado de encolamiento en el modal. El progreso detallado se sigue desde el panel de jobs global.

#### Scenario: Lanzar el Health Check parcial

- **WHEN** el usuario ha seleccionado al menos una nota y pulsa el botón de confirmación
- **THEN** el modal envía `POST /api/jobs/health-check/partial` con la lista de paths seleccionados
- **AND** el sistema encola el job y devuelve el job ID
- **AND** el modal muestra confirmación de que el job ha sido encolado y se puede cerrar

#### Scenario: Health Check parcial encolado correctamente

- **WHEN** `POST /api/jobs/health-check/partial` devuelve 202 Accepted
- **THEN** el modal transiciona al estado "enqueued"
- **AND** muestra el mensaje "Health Check encolado. Sigue el progreso en el panel de jobs."

#### Scenario: Error al encolar el Health Check parcial

- **WHEN** `POST /api/jobs/health-check/partial` devuelve error
- **THEN** el modal muestra un mensaje de error
- **AND** el botón de confirmación vuelve a estar habilitado

## MODIFIED Requirements

### Requirement: Endpoint backend para Health Check parcial

El sistema SHALL exponer `POST /api/jobs/health-check/partial` con body `{ "paths": ["wiki/concepts/foo", "wiki/sources/bar"] }` que encola un job `HEALTH_CHECK` con los paths como payload y devuelve `202 Accepted` con el job ID.

#### Scenario: Petición con paths válidos

- **WHEN** se llama a `POST /api/jobs/health-check/partial` con un body JSON que contiene la lista de paths
- **THEN** el endpoint serializa los paths a un fichero de payload y encola el job
- **AND** devuelve `202 Accepted` con el job ID

#### Scenario: Petición sin paths o con lista vacía

- **WHEN** se llama a `POST /api/jobs/health-check/partial` sin body o con `paths` vacío
- **THEN** el endpoint devuelve un error 400 Bad Request

#### Scenario: Paths inexistentes ignorados graciosamente

- **WHEN** algún path de la lista no corresponde a ninguna nota del índice
- **THEN** el worker ignora ese path y procesa únicamente las notas que sí existen
- **AND** el job termina correctamente sin error

## REMOVED Requirements

### Requirement: Endpoint backend para Health Check parcial (SSE)

**Reason**: Reemplazado por el endpoint `POST /api/jobs/health-check/partial` basado en jobs. El endpoint `GET /api/settings/health-check/partial` se elimina.
**Migration**: Los consumidores deben usar `POST /api/jobs/health-check/partial` y seguir el progreso a través del stream de eventos de job global.
