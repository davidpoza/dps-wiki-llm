# ADR-0010: Prompts editables en base de datos

- Estado: Inferida del codigo y migraciones
- Fecha: 2026-07-25
- Responsables: No determinado a partir del repositorio
- Ambito: Configuracion de IA

## Contexto

El comportamiento LLM depende de prompts que evolucionan con el producto.

## Problema

Cambiar prompts solo en codigo obliga a redeploy y dificulta ajustes operativos.

## Opciones consideradas

### Opcion 1

Guardar prompts en tabla `llm_prompts` y editarlos por API.

### Opcion 2

Prompts hardcoded en servicios.

### Opcion 3

Prompts en archivos del vault.

## Decision

Persistir prompts en PostgreSQL con migraciones Flyway y exponer endpoints de settings.

## Justificacion

`V8__llm_prompts.sql` crea prompts base; migraciones posteriores los refinan. `PromptController` permite listarlos y actualizarlos.

## Consecuencias positivas

- Ajuste operativo sin cambiar codigo.
- Historial de prompts base por migraciones.

## Consecuencias negativas

- Prompts editados en produccion viven en DB y deben respaldarse.
- Cambios manuales pueden alejarse del comportamiento esperado por tests.

## Riesgos

- Prompt mal editado puede romper parsing o mutaciones.

## Criterios para revisar esta decision

- Si se necesita versionado formal/A-B testing/evaluacion de prompts.

## Referencias al codigo

- `backend/src/main/resources/db/migration/V8__llm_prompts.sql`
- `backend/src/main/resources/db/migration/V22__keywords_in_source_note_prompt.sql`
- `backend/src/main/java/com/dpswikillm/controllers/PromptController.java`
- `backend/src/main/java/com/dpswikillm/services/PromptService.java`

