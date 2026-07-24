## Context

El vault ya cuenta con un `KeywordGenerationService` que genera keywords vía LLM y escribe en frontmatter, pero opera en modo batch-without-selection y no salta notas con keywords si se le pide sobreescribir. Los prompts LLM se almacenan en la tabla `llm_prompts` y se actualizan mediante migraciones Flyway. Los jobs asíncronos fluyen por RabbitMQ (cola `write-queue`), se persisten en la tabla `jobs`, y el frontend los sigue vía SSE en `/api/jobs/events`. El soporte de revert ya existe para INGEST/ENRICH/MERGE y puede reutilizarse.

## Goals / Non-Goals

**Goals:**
- Permitir regenerar (sobreescribir) keywords en notas seleccionadas individualmente o en lote.
- Actualizar los prompts `keywords-system` y `source-note-system` con nuevas reglas vía Flyway.
- Integrar el proceso en el sistema de jobs con SSE y revert.
- Exponer un botón en el editor para nota individual y un panel de selección en Configuración.

**Non-Goals:**
- Eliminar o deprecar el endpoint SSE antiguo `/api/keywords/generate`.
- Cambiar la lógica de extracción de texto (Summary → body sin secciones excluidas).
- Generación automática periódica (cron).

## Decisions

### Nuevo endpoint `POST /api/keywords/regenerate`

Acepta `{ "paths": ["wiki/concepts/foo.md", ...] }`. Crea un job `REGENERATE_KEYWORDS` con `payloadRef` que apunta a un JSON temporal guardado en el vault bajo `raw/keywords/<jobId>.json` (siguiendo el patrón de ingest que guarda en `raw/inbox/`). Devuelve `202 Accepted` con el job id. Si `paths` está vacío, rechaza con 400.

Para el caso de nota única desde el editor, el frontend envía `{ "paths": ["<current-note-path>"] }`.

### `KeywordRegenerationJobHandler`

Nuevo servicio que implementa el flujo del job:
1. Lee la lista de paths desde `payloadRef`.
2. Para cada path, llama `KeywordGenerationService.generateForNote(path, overwrite=true)` (se añade el flag `overwrite` al método existente).
3. Emite `PROGRESS` SSE por cada nota procesada.
4. Al final, hace commit git con todas las notas modificadas y registra `affectedPaths` y `preGitSha` para soporte de revert.
5. Marca el job `COMPLETED`.

### Revert

El revert del job `REGENERATE_KEYWORDS` usa el mismo `JobRevertService` existente (git revert del commit range + rollback de embeddings si aplica). Los keywords son solo texto en frontmatter de markdown, sin rows en tablas de documentos/embeddings propias, así que el revert git es suficiente. Se añade `REGENERATE_KEYWORDS` al switch de `JobRevertService` con la misma lógica de revert git que ENRICH/MERGE.

### Listado de notas para el panel de selección

Nuevo endpoint `GET /api/notes/list?folders=wiki/concepts,wiki/sources` que devuelve `[{ "path": "...", "title": "...", "hasKeywords": boolean }]`. Se implementa como controlador ligero que lee el sistema de ficheros sin pasar por la BD. El campo `hasKeywords` permite al frontend mostrar visualmente qué notas ya tienen keywords.

### UI en Configuración

La sección "Keywords" en `SettingsComponent` sustituye el botón simple por un botón "Seleccionar notas…" que abre un modal (`KeywordSelectionModalComponent`). El modal:
- Carga las notas vía `GET /api/notes/list`.
- Muestra un input de búsqueda (filtra por título/path en cliente).
- Muestra lista con checkboxes, agrupadas por carpeta.
- Botones "Seleccionar todo" / "Deseleccionar todo".
- Botón "Regenerar keywords (N)" que llama `POST /api/keywords/regenerate` y redirige a `/jobs`.

### UI en el editor

En la toolbar del `MarkdownEditorComponent`, nuevo icono (p. ej. tag/label icon) con tooltip "Regenerar keywords". Al pulsar, llama `POST /api/keywords/regenerate` con `{ "paths": [currentPath] }` y navega a `/jobs`. Solo visible cuando la nota abierta está bajo `wiki/concepts` o `wiki/sources`.

### Actualizaciones de prompts (Flyway)

- **V33**: `UPDATE llm_prompts SET text = '...' WHERE key = 'keywords-system'` con el nuevo prompt proporcionado por el usuario.
- **V34**: `UPDATE llm_prompts SET text = '...' WHERE key = 'source-note-system'` con el nuevo prompt proporcionado por el usuario.

## Risks / Trade-offs

- **Commit granularity**: agrupar todas las notas de un batch en un único commit facilita el revert atómico, pero si el proceso se interrumpe a mitad, las notas ya escritas al disco (vía `FileService.saveContent`) pueden quedar sin commitear. Mitigation: el handler hace commit solo al final; si falla, el revert manual de git limpia todo.
- **Tiempo de ejecución**: un batch de 200 notas puede tardar varios minutos. El SSE mantiene la conexión; el frontend muestra progreso. No hay timeout agresivo en el consumer de RabbitMQ.
- **Sobreescritura accidental**: el usuario selecciona explícitamente las notas, y el revert está disponible en /jobs. Riesgo aceptable.
