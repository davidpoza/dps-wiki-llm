## Why

Los enlaces internos (wikilinks) conectan notas pero no explican el motivo de esa conexión. Cuando el usuario no recuerda por qué dos notas están enlazadas, no tiene forma de consultarlo sin releer ambas notas manualmente. Esta feature permite pedir al LLM una justificación contextual de la relación, accesible mediante menú contextual con clic derecho sobre el enlace.

## What Changes

- Al hacer clic derecho sobre un wikilink renderizado en el editor Milkdown, aparece un menú contextual con la opción "Explicar enlace".
- Seleccionar esa opción abre un modal que llama al LLM con el contenido de ambas notas (origen y destino) y muestra la justificación de por qué están enlazadas.
- Se añade un nuevo prompt configurable (`link-explain-system`) a la tabla `llm_prompts`, editable desde la pantalla `/settings` junto al resto de prompts.
- Se crea un nuevo endpoint REST `POST /api/notes/explain-link` que recibe las rutas de las dos notas, recupera su contenido y llama al LLM con el prompt configurable.

## Capabilities

### New Capabilities
- `link-explain-context-menu`: Menú contextual sobre wikilinks renderizados en el editor que ofrece la opción "Explicar enlace".
- `link-explain-modal`: Modal que muestra la justificación LLM de la relación entre dos notas enlazadas.
- `link-explain-api`: Endpoint backend `POST /api/notes/explain-link` que orquesta la llamada al LLM con el contenido de ambas notas.

### Modified Capabilities
- `prompt-settings`: Se añade el nuevo prompt `link-explain-system` a la tabla `llm_prompts` (nueva migración Flyway) y queda editable en la pantalla de configuración.

## Impact

- **Frontend**: Milkdown editor plugin para capturar `contextmenu` sobre nodos wikilink; nuevo `LinkExplainModalComponent`; `PromptService` (Angular) no cambia.
- **Backend**: Nueva migración Flyway para insertar `link-explain-system`; nuevo `LinkExplainController` + `LinkExplainService` que lee el contenido de dos notas y llama al LLM vía `PromptService` + Spring AI.
- **Base de datos**: Una fila nueva en `llm_prompts`.
- **Sin cambios en**: sistema de wikilinks de navegación, embeddings, job queue.
