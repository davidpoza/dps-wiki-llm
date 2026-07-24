## MODIFIED Requirements

### Requirement: Los prompts LLM se almacenan en base de datos

El sistema SHALL mantener todos los prompts usados internamente en la tabla `llm_prompts`, con una clave única por prompt, nombre legible y texto. La tabla SHALL ser inicializada mediante migración Flyway con los valores actuales como datos por defecto. Las migraciones V33 y V34 SHALL actualizar los textos de `keywords-system` y `source-note-system` respectivamente con las nuevas reglas de generación de keywords.

#### Scenario: Carga inicial de prompts

- **WHEN** la aplicación arranca por primera vez (o se aplica la migración V8)
- **THEN** la tabla `llm_prompts` contiene exactamente tres filas: `source-note-system`, `mutation-plan-system`, `answer-system`, con sus textos actuales

#### Scenario: Migración V33 actualiza keywords-system

- **WHEN** se aplica la migración V33
- **THEN** el texto del prompt con clave `keywords-system` en la tabla `llm_prompts` refleja las nuevas reglas de generación de keywords (multiword concepts, canonicidad, discriminatividad, orden por relevancia)

#### Scenario: Migración V34 actualiza source-note-system

- **WHEN** se aplica la migración V34
- **THEN** el texto del prompt con clave `source-note-system` en la tabla `llm_prompts` refleja el bloque `keywords` actualizado con las nuevas reglas
