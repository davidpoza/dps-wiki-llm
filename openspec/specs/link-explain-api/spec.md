# link-explain-api Specification

## Purpose
TBD - created by archiving change internal-link-explain-modal. Update Purpose after archive.
## Requirements
### Requirement: Endpoint POST /api/notes/explain-link orquesta la llamada LLM

El sistema SHALL exponer `POST /api/notes/explain-link` con body `{ "sourcePath": "...", "targetPath": "..." }`. El endpoint SHALL leer el contenido de ambas notas desde el vault, construir el prompt usando `link-explain-system` de `PromptService`, llamar al LLM vía `LlmClient` y devolver la explicación en el body. El endpoint SHALL requerir autenticación JWT válida.

#### Scenario: Llamada exitosa devuelve la explicación

- **WHEN** usuario autenticado llama a `POST /api/notes/explain-link` con `sourcePath` y `targetPath` válidos
- **THEN** respuesta 200 con body `{ "explanation": "<texto generado por el LLM>" }`

#### Scenario: sourcePath no encontrado devuelve 404

- **WHEN** usuario autenticado llama con un `sourcePath` que no existe en el vault
- **THEN** respuesta 404

#### Scenario: targetPath no encontrado devuelve 404

- **WHEN** usuario autenticado llama con un `targetPath` que no existe en el vault
- **THEN** respuesta 404

#### Scenario: Request sin autenticación rechazado

- **WHEN** request sin JWT válido llama a `POST /api/notes/explain-link`
- **THEN** respuesta 401

#### Scenario: Notas largas son truncadas antes de enviar al LLM

- **WHEN** el contenido de alguna de las notas supera 3000 caracteres
- **THEN** el texto enviado al LLM está truncado a 3000 caracteres por nota

#### Scenario: El prompt del sistema se lee desde la base de datos

- **WHEN** se llama al endpoint con notas válidas
- **THEN** el mensaje `system` enviado al LLM es el texto almacenado en `llm_prompts` para la clave `link-explain-system`
