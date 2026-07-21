## Why

Los usuarios a menudo tienen contenido Markdown copiado en el portapapeles (desde editores, webs, herramientas de notas) y la única vía actual de ingestión por texto es subir un fichero `.md`, lo que genera fricción innecesaria. Añadir un textarea donde pegar directamente el Markdown elimina ese paso intermedio.

## What Changes

- Nueva sección en el componente de ingestión del frontend con un textarea para pegar Markdown y un campo opcional de título.
- Nuevo endpoint `POST /api/ingest/text` en el backend que acepta el contenido Markdown en bruto (JSON) y lo persiste en `raw/inbox/`.
- Nuevo método en `RawIntakeService` para procesar texto Markdown inline (similar a `ingestMarkdown` pero desde string en lugar de `MultipartFile`).
- Nuevo método en `ApiService` del frontend para llamar al endpoint.
- Traducciones i18n para los nuevos textos de la UI.

## Capabilities

### New Capabilities

- `ingest-md-text`: Ingestión de Markdown pegado directamente en un textarea, sin necesidad de fichero. Incluye campo de título opcional y validación de tamaño en frontend y backend.

### Modified Capabilities

- `ingest-file-upload`: No hay cambios de requisitos, solo se añade una nueva sección a la pantalla de ingestión ya existente.

## Impact

- **Frontend**: `ingest.component.ts` (nueva sección en el template y nueva señal/método), `api.service.ts` (nuevo método `ingestText`), ficheros de traducción `es.json` / `en.json`.
- **Backend**: `JobController.java` (nuevo endpoint `/ingest/text`), `RawIntakeService.java` (nuevo método `ingestText`).
- Sin cambios en esquema de base de datos ni en el pipeline de procesamiento existente.
