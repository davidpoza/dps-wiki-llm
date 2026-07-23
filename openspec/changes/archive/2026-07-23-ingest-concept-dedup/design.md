## Context

La ingesta actual genera un `MutationPlan` vía LLM que puede incluir acciones `create` en `wiki/concepts/`. El spec `concept-dedup-check` ya garantiza que si el path exacto existe en disco se convierte a `update`. Sin embargo, el LLM puede proponer `wiki/concepts/ml.md` cuando ya existe `wiki/concepts/machine-learning.md`, produciendo un duplicado semántico que ningún guardrail actual detecta.

La infraestructura de búsqueda semántica ya existe: `SemanticSearchService.searchByType(query, "concept", k)` devuelve los K conceptos más similares usando embeddings pgvector. El `doc_type` de los documentos en `wiki/concepts/` es `"concept"` (inferido por `ReindexService.inferDocType`).

## Goals / Non-Goals

**Goals:**
- Detectar duplicados semánticos antes de aplicar mutaciones: si el LLM propone crear un concepto y ya existe uno muy similar, convertir la acción a `update` sobre el path existente.
- Normalizar slugs a inglés singular en origen (en el prompt) y validar en guardrail.
- No añadir latencia significativa al camino común (cuando no hay candidatos de concepto en el plan).

**Non-Goals:**
- Deduplicar conceptos ya existentes en el vault (limpieza retroactiva).
- Resolver sinónimos entre conceptos ya existentes entre sí (solo nuevos vs existentes).
- Persistencia de alias en base de datos (se deja para una iteración posterior).

## Decisions

### D1 — Punto de integración: antes de `MutationApplier`, después del guardrail

El `ConceptResolutionService` se invoca en `IngestPipelineService` entre `guardrailService.guardrail(...)` y `mutationApplier.apply(...)`. Esto permite que opere sobre un plan ya saneado (paths válidos, baclinks presentes) sin duplicar lógica de validación.

**Alternativa descartada**: integrarlo dentro del guardrail. El guardrail es síncrono y sin I/O costoso; añadirle llamadas LLM rompería su semántica.

### D2 — Estrategia de resolución: embedding search + LLM judge

Para cada acción `create` en `wiki/concepts/` del plan:
1. **Búsqueda semántica**: `SemanticSearchService.searchByType(conceptName, "concept", 3)` → top-3 candidatos con score de similitud coseno.
2. **Filtro por umbral**: si ningún candidato supera `CONCEPT_SIMILARITY_THRESHOLD` (default `0.82`, configurable vía `app.concept.similarity-threshold`), la acción se mantiene como `create` sin llamada LLM.
3. **LLM judge** (solo si hay candidatos sobre umbral): prompt compacto que recibe el nombre propuesto + top-3 existentes (nombre + primeras 200 chars de body). Responde JSON `{"match": "<path-existente>"|null}`.
4. Si `match != null` → la acción se reescribe a `update` sobre el path existente.

**Alternativa descartada**: dar al LLM toda la lista de conceptos. No escala con vaults grandes y aumenta coste por token innecesariamente.

### D3 — Umbral 0.82 como punto de partida

El umbral de 0.82 (coseno) está calibrado para que sinónimos directos (ML ≈ machine-learning, ~0.91) y acrónimos comunes sean convocados al juez LLM, mientras que conceptos distintos con cierta relación semántica (idempotency ≈ consistency, ~0.75) no lo sean. Se expone como parámetro de configuración para ajuste empírico sin redeploy.

### D4 — El LLM judge usa un prompt dedicado en BD (`concept-judge-system`)

Se añade una nueva entrada en `llm_prompts` para el prompt del juez. Esto permite ajustarlo en caliente igual que los otros prompts del sistema.

### D5 — Slug normalization en el prompt, no en código

Se actualiza `mutation-plan-system` para instruir al LLM que normalice slugs a inglés singular antes de proponer paths. El guardrail existente (vía `MutationGuardrailService`) añade una capa de rechazo si el slug llega en plural, pero la normalización en origen es más barata que corregir post-hoc.

Para la normalización en guardrail: se integrará una heurística simple (eliminar "-s" final en palabras inglesas comunes) que convierta plurales obvios a singular antes de rechazar. Casos ambiguos (bus, analysis) se dejan como `noop` con log.

## Risks / Trade-offs

- **Falso negativo del juez LLM** → Se crea un duplicado. Mitigation: el umbral bajo (0.82) amplía la red; además el step `concept-dedup-check` existente actúa como última barrera si el path exacto ya existe.
- **Latencia adicional por llamada LLM extra** → Solo ocurre cuando hay candidatos sobre umbral, que es el caso minoritario en ingestas frecuentes. Mitigation: timeout de 5 s en el judge; si supera timeout, se usa `create` (falla abierta).
- **Embeddings desactualizados** → Si se ingesta un concepto y aún no se ha embeddado, el search no lo encontrará. Mitigation: `embedIncremental` se ejecuta antes de `connection-discovery` en el pipeline; el nuevo paso de resolución va después, así que los embeddings de la ingesta actual ya están presentes.
- **Coste LLM**: una llamada extra por ingesta cuando hay match. Prompts compactos (~500 tokens) minimizan el impacto.

## Migration Plan

1. Nueva migración Flyway `V26__concept_judge_prompt.sql` con el prompt inicial.
2. Nueva migración `V27__concept_similarity_threshold_setting.sql` que añade `CONCEPT_SIMILARITY_THRESHOLD` en `app_settings` con valor `0.82`.
3. `ConceptResolutionService` es aditivo; no modifica comportamiento existente si el plan no contiene acciones de concepto.
4. Rollback: deshabilitar el servicio vía feature flag en `app_settings` (`concept.resolution.enabled`, default `true`).

## Open Questions

- ¿Debe el alias detectado (ej: "ML" → "machine-learning") escribirse en el frontmatter del concepto existente como `aliases: [ml]`? Propuesto que sí, pero requiere que `MutationApplier.apply(update)` soporte merge de listas en frontmatter.
- ¿Debería el judge LLM también proponer fusionar el contenido del nuevo concepto en el existente, o simplemente redirigir la acción? Por ahora solo redirige; la fusión de contenido se deja para futuro.
