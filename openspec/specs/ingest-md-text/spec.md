# ingest-md-text Specification

## Purpose
TBD - created by archiving change ingest-md-from-clipboard. Update Purpose after archive.
## Requirements
### Requirement: Textarea para pegar Markdown
La pantalla de ingestión SHALL mostrar una nueva sección con un textarea multilínea donde el usuario pueda pegar contenido Markdown, un campo de texto opcional para el título del documento y un botón para enviar.

#### Scenario: Textarea visible en la pantalla de ingestión
- **WHEN** el usuario navega a la pantalla de ingestión
- **THEN** la sección "Pegar Markdown" SHALL estar visible bajo las secciones de subida de fichero y URL

#### Scenario: Botón deshabilitado sin contenido
- **WHEN** el textarea está vacío
- **THEN** el botón de ingestar SHALL estar deshabilitado

#### Scenario: Botón habilitado con contenido
- **WHEN** el textarea contiene al menos un carácter no vacío
- **THEN** el botón de ingestar SHALL estar habilitado (salvo que `busy` sea `true`)

### Requirement: Envío de Markdown al backend
Al pulsar el botón de ingestar, el frontend SHALL enviar el contenido del textarea y el título opcional al endpoint `POST /api/ingest/text`, con el modo de ingestión seleccionado.

#### Scenario: Envío exitoso limpia el formulario
- **WHEN** el backend responde con 202 Accepted
- **THEN** el textarea y el campo de título SHALL quedar vacíos, y SHALL mostrarse el jobId recibido

#### Scenario: Error de envío muestra mensaje
- **WHEN** el backend responde con un error
- **THEN** SHALL mostrarse el mensaje de error igual que en las otras secciones de ingestión

### Requirement: Validación de tamaño en frontend
Antes de enviar, el frontend SHALL verificar que el contenido no supera 2 MB (2.097.152 bytes en UTF-8).

#### Scenario: Contenido demasiado largo
- **WHEN** el texto pegado supera 2 MB
- **THEN** el botón SHALL estar deshabilitado y SHALL mostrarse una advertencia de tamaño junto al textarea

### Requirement: Endpoint POST /api/ingest/text
El backend SHALL exponer `POST /api/ingest/text` que acepta un JSON `{ content: string, title?: string, mode?: JobMode }`, persiste el contenido en `raw/inbox/` con el slug derivado del título (o timestamp si no hay título) y encola un job de tipo `INGEST`.

#### Scenario: Ingestión con título
- **WHEN** se envía `{ content: "# Doc\n...", title: "Mi nota", mode: "unattended" }`
- **THEN** el sistema SHALL escribir el fichero en `raw/inbox/<timestamp>-mi-nota.md` y responder 202 con el jobId

#### Scenario: Ingestión sin título
- **WHEN** se envía `{ content: "# Doc\n..." }` sin campo `title`
- **THEN** el sistema SHALL escribir el fichero en `raw/inbox/<timestamp>-clipboard.md` y responder 202 con el jobId

#### Scenario: Contenido excede 2 MB
- **WHEN** el campo `content` supera 2.097.152 bytes
- **THEN** el sistema SHALL responder 400 Bad Request con un mensaje de error descriptivo

#### Scenario: Contenido vacío
- **WHEN** el campo `content` es una cadena vacía o solo espacios en blanco
- **THEN** el sistema SHALL responder 400 Bad Request

