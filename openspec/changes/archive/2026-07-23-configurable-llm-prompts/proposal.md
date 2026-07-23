## Why

Los prompts que usa la aplicación internamente están hardcodeados en el código fuente de los servicios Java, lo que obliga a redeployar la aplicación para cualquier ajuste. Almacenarlos en base de datos permite modificarlos en caliente a través de una pantalla de configuración sin tocar el código.

## What Changes

- Nueva tabla `llm_prompts` en PostgreSQL que almacena cada prompt con clave única, nombre legible, texto y timestamp de última modificación.
- Nuevo `PromptRepository` y `PromptService` en el backend para cargar prompts por clave, con caché en memoria para evitar consultas en cada llamada LLM.
- Los tres servicios que tienen prompts hardcodeados (`SourceNoteLlmService`, `LlmMutationPlanService`, `AnswerPipelineService`) pasan a obtener sus prompts desde `PromptService`.
- Migración Flyway que inserta los valores actuales como datos iniciales, garantizando zero-downtime.
- Nuevo endpoint REST `GET/PUT /api/settings/prompts` (y `GET/PUT /api/settings/prompts/{key}`) protegido con autenticación.
- Nueva pantalla de configuración en Angular con sección de prompts: lista editable de prompts con textarea para cada uno y botón de guardado.

## Capabilities

### New Capabilities

- `prompt-settings`: CRUD de prompts LLM desde la UI; los cambios son efectivos de inmediato sin restart.

### Modified Capabilities

_(ninguna — los servicios existentes solo cambian su fuente de datos, no su contrato externo)_

## Impact

- **Backend**: `SourceNoteLlmService`, `LlmMutationPlanService`, `AnswerPipelineService` dejan de tener strings literales; se añade `PromptRepository`, `PromptService`, `PromptController`, migración V8.
- **Frontend**: Nuevo componente `settings.component.ts` con routing `/settings`; `ApiService` añade métodos para el endpoint de prompts.
- **BD**: Nueva tabla `llm_prompts` (no breaking, solo additive).
- **Sin breaking changes** en APIs existentes.
