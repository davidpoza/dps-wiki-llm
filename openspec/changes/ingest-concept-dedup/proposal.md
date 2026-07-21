## Why

Durante la ingesta, el LLM puede proponer crear conceptos que ya existen bajo un nombre diferente (sinónimo, acrónimo, plural, idioma distinto), lo que produce duplicados semánticos en `wiki/concepts/`. El spec existente `concept-dedup-check` solo detecta colisiones exactas de path en disco; no detecta que "ML" y "machine-learning", o "neural-nets" y "neural-network", son el mismo concepto.

## What Changes

- Se añade una fase de **resolución semántica** antes de aplicar el plan de mutación: para cada `create` en `wiki/concepts/`, se buscan los top-K conceptos más similares usando el índice de embeddings existente.
- Si la similitud supera un umbral configurable, un **LLM-as-judge** decide si el candidato es el mismo concepto que uno existente; en ese caso la acción se convierte en `update` sobre el path existente.
- El LLM que genera el plan de mutación normaliza los candidatos a **inglés, singular, kebab-case** antes de proponer el path; el guardrail rechaza slugs que incumplan esta regla.
- Se añade una nueva tabla/columna `concept_aliases` (o campo en frontmatter) para registrar los sinónimos detectados, evitando repetir el juicio en futuras ingestas.

## Capabilities

### New Capabilities
- `concept-semantic-dedup`: Resolución semántica de conceptos antes de aplicar mutaciones — embedding search + LLM-judge para detectar duplicados por similitud, no solo por path exacto.

### Modified Capabilities
- `concept-dedup-check`: El requisito de validación de slug (inglés, singular, kebab-case) se amplía: el sistema ahora también debe normalizar activamente el slug propuesto antes de rechazarlo, convirtiendo plurales obvios a singular cuando sea posible, en lugar de simplemente convertir la acción en `noop`.

## Impact

- **Backend**: nuevo servicio `ConceptResolutionService` que orquesta embedding search + LLM judge; se integra en `IngestPipelineService` antes de `MutationApplier`.
- **`MutationGuardrailService`**: amplía la validación de slugs con normalización activa (singular, inglés).
- **`LlmMutationPlanService`**: el prompt `mutation-plan-system` se actualiza para instruir normalización de slugs en origen.
- **Embeddings**: se reutiliza `EmbeddingIndexService` para búsqueda por similitud; no se necesita nueva infraestructura.
- **Base de datos**: nuevo campo `aliases` en frontmatter de concept notes (sin cambio de esquema DB) o tabla auxiliar opcional para caché de decisiones.
- **Tests**: nuevos tests de integración para `ConceptResolutionService` con casos de sinónimos, acrónimos y falsos positivos.
