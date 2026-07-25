# prompt-settings Specification

## Purpose
TBD - created by archiving change configurable-llm-prompts. Update Purpose after archive.
## Requirements
### Requirement: Los prompts LLM se almacenan en base de datos

El sistema SHALL mantener todos los prompts usados internamente en la tabla `llm_prompts`, con una clave única por prompt, nombre legible y texto. La tabla SHALL ser inicializada mediante migración Flyway con los valores actuales como datos por defecto. Las migraciones V33 y V34 SHALL actualizar los textos de `keywords-system` y `source-note-system` respectivamente con las nuevas reglas de generación de keywords. La migración V37 SHALL insertar el prompt `link-explain-system` con un texto inicial que instruye al LLM a justificar la relación entre dos notas.

#### Scenario: Carga inicial de prompts

- **WHEN** la aplicación arranca por primera vez (o se aplica la migración V8)
- **THEN** la tabla `llm_prompts` contiene exactamente tres filas: `source-note-system`, `mutation-plan-system`, `answer-system`, con sus textos actuales

#### Scenario: Migración V33 actualiza keywords-system

- **WHEN** se aplica la migración V33
- **THEN** el texto del prompt con clave `keywords-system` en la tabla `llm_prompts` refleja las nuevas reglas de generación de keywords (multiword concepts, canonicidad, discriminatividad, orden por relevancia)

#### Scenario: Migración V34 actualiza source-note-system

- **WHEN** se aplica la migración V34
- **THEN** el texto del prompt con clave `source-note-system` en la tabla `llm_prompts` refleja el bloque `keywords` actualizado con las nuevas reglas

#### Scenario: Migración V37 inserta link-explain-system

- **WHEN** se aplica la migración V37
- **THEN** la tabla `llm_prompts` contiene una fila con clave `link-explain-system`, nombre `"Explicar enlace entre notas"` y un texto de prompt inicial

### Requirement: Los servicios LLM cargan prompts desde la base de datos
Los servicios `SourceNoteLlmService`, `LlmMutationPlanService` y `AnswerPipelineService` SHALL obtener el texto de sus prompts a través de `PromptService` en lugar de usar literales hardcodeados. El sistema SHALL cachear los prompts en memoria para evitar consultas a BD en cada llamada LLM; la caché SHALL invalidarse cuando un prompt sea actualizado.

#### Scenario: Servicio usa prompt de BD
- **WHEN** `SourceNoteLlmService.buildNote()` es invocado
- **THEN** el mensaje `system` enviado al LLM es el texto almacenado en `llm_prompts` para la clave `source-note-system`

#### Scenario: Cambio de prompt efectivo sin restart
- **WHEN** un administrador actualiza el texto de un prompt vía la API
- **THEN** la siguiente llamada LLM de ese servicio usa el nuevo texto, sin necesidad de reiniciar la aplicación

### Requirement: API REST para gestión de prompts
El sistema SHALL exponer los endpoints:
- `GET /api/settings/prompts` → devuelve la lista completa de prompts (clave, nombre, texto, updatedAt)
- `GET /api/settings/prompts/{key}` → devuelve un único prompt
- `PUT /api/settings/prompts/{key}` → actualiza el texto de un prompt existente

Ambos endpoints SHALL requerir autenticación JWT válida. El `PUT` SHALL devolver 404 si la clave no existe (no se permite crear nuevas claves desde la API).

#### Scenario: Listar todos los prompts
- **WHEN** usuario autenticado hace `GET /api/settings/prompts`
- **THEN** respuesta 200 con array JSON de objetos `{key, name, text, updatedAt}`

#### Scenario: Actualizar prompt con éxito
- **WHEN** usuario autenticado hace `PUT /api/settings/prompts/source-note-system` con body `{"text": "<nuevo texto>"}`
- **THEN** respuesta 200, la BD refleja el nuevo texto y la caché es invalidada

#### Scenario: Clave inexistente rechazada
- **WHEN** usuario autenticado hace `PUT /api/settings/prompts/no-existe` 
- **THEN** respuesta 404

#### Scenario: Request sin autenticación rechazado
- **WHEN** request sin JWT hace `GET /api/settings/prompts`
- **THEN** respuesta 401

### Requirement: Pantalla de configuración en Angular con sección de prompts
El frontend SHALL incluir una ruta `/settings` con un componente `SettingsComponent` que muestre todos los prompts en un formulario editable. Cada prompt SHALL mostrarse con su nombre legible y un `<textarea>` con el texto actual. Un botón de guardado por prompt (o global) SHALL enviar el nuevo texto vía `PUT /api/settings/prompts/{key}`. El usuario SHALL recibir feedback visual (success/error) tras guardar.

#### Scenario: Visualizar prompts
- **WHEN** el usuario navega a `/settings`
- **THEN** ve la lista de prompts con sus nombres y textos actuales cargados desde la API

#### Scenario: Editar y guardar prompt
- **WHEN** el usuario modifica el texto de un prompt y hace clic en "Guardar"
- **THEN** se llama `PUT /api/settings/prompts/{key}` con el nuevo texto y se muestra confirmación de éxito

#### Scenario: Error al guardar
- **WHEN** la petición de guardado falla (ej. error de red)
- **THEN** se muestra un mensaje de error y el campo sigue editable

### Requirement: Enlace de navegación a configuración
La navegación principal SHALL incluir un enlace a `/settings` visible para usuarios autenticados.

#### Scenario: Acceso desde navbar
- **WHEN** el usuario está autenticado y ve la barra de navegación
- **THEN** hay un enlace "Configuración" (o icono equivalente) que lleva a `/settings`

