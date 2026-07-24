## Why

El proceso actual de generación de keywords solo actúa sobre notas que aún no tienen el campo `keywords`, sin posibilidad de sobreescribir notas ya procesadas con prompts mejorados. Los prompts de `keywords-system` y `source-note-system` han evolucionado (reglas más precisas, multiword concepts, canonicidad, discriminatividad) y se necesita un mecanismo para regenerar keywords de forma selectiva, tanto en lote desde Configuración como nota a nota desde el editor.

## What Changes

- **Nuevo prompt `keywords-system`**: reglas más precisas sobre multiword concepts, canonicidad, discriminatividad y orden por relevancia. Implementado como nueva migración Flyway (V33).
- **Nuevo prompt `source-note-system`**: actualización del bloque `keywords` con las mismas reglas mejoradas. Implementado como nueva migración Flyway (V34).
- **UI de selección batch en Configuración**: la sección "Keywords" muestra un modal/panel con listado de todas las notas de `wiki/concepts` y `wiki/sources` con checkboxes, buscador y acción "seleccionar todo / ninguno". Al confirmar, lanza un job asíncrono de regeneración que sobreescribe los keywords de las notas seleccionadas.
- **Botón en toolbar del editor markdown**: icono en la barra de herramientas del editor que lanza el mismo job de regeneración solo para la nota actualmente abierta.
- **Nuevo JobType `REGENERATE_KEYWORDS`**: integrado en la cola de escritura de RabbitMQ, con payload que lista las rutas de notas a procesar, progreso SSE, y soporte de revert (git revert del commit de keywords).

## Capabilities

### New Capabilities

- `keyword-regeneration-job`: Job asíncrono REGENERATE_KEYWORDS encolado en RabbitMQ, con payload de lista de rutas de notas, progreso SSE por nota, soporte de revert siguiendo el mismo patrón que los jobs de ingest.
- `keyword-regeneration-ui`: UI de selección de notas (batch desde Settings, nota única desde editor toolbar) que enrola el job y redirige a /jobs para seguimiento.

### Modified Capabilities

- `keyword-generation`: El proceso ya no salta notas con keywords existentes cuando se llama desde el nuevo job. La sobreescritura es intencional. El endpoint SSE existente (`/api/keywords/generate`) y el flujo no-job se mantienen tal cual para compatibilidad hasta que se deprecen.
- `prompt-settings`: Dos nuevas filas en `llm_prompts` (la tabla ya existe): se actualiza el texto de `keywords-system` y `source-note-system` vía migración Flyway.
- `markdown-editor-toolbar`: Se añade un botón "Generar keywords" a la barra de herramientas del editor que dispara el job para la nota abierta.

## Impact

- **Backend**: nuevo `JobType.REGENERATE_KEYWORDS`, nuevo `KeywordRegenerationJobHandler`, nuevo endpoint `POST /api/keywords/regenerate` (acepta lista de rutas), nuevas migraciones V33 y V34.
- **Frontend**: `SettingsComponent` añade modal de selección de notas + llamada a nuevo endpoint; `MarkdownEditorComponent` añade botón en toolbar; nuevo endpoint de listado de notas `GET /api/notes/list?folders=wiki/concepts,wiki/sources` si no existe.
- **Base de datos**: actualizaciones de texto de prompts en `llm_prompts` (migraciones Flyway).
- **Sin breaking changes de API**: el endpoint existente `/api/keywords/generate` no se elimina.
