## 1. Excluir wiki/projects/ de todos los pipelines

- [x] 1.1 Añadir `wiki/projects/` al glob de exclusión en `tools/reindex.ts`
- [x] 1.2 Añadir `wiki/projects/` al glob de exclusión en `tools/embed-index.ts`
- [x] 1.3 Añadir `wiki/projects/` al glob de exclusión en `tools/lint.ts`
- [x] 1.4 Añadir `wiki/projects/` al glob de exclusión en `tools/health-check.ts`
- [x] 1.5 Excluir rutas `wiki/projects/` de los `supporting_notes` enviados al LLM en `tools/services/ingest/build-llm-plan.ts` (filtrar antes de construir el contexto)

## 2. Modificar el prompt del LLM para prohibir creación de topics

- [x] 2.1 En `tools/services/ingest/build-llm-plan.ts`, reemplazar las instrucciones de topics actuales por una regla explícita: nunca proponer `action: "create"` bajo `wiki/topics/`; solo `action: "update"` a topics ya existentes está permitido
- [x] 2.2 Eliminar `wiki/topics/` de `ALLOWED_PAGE_PREFIXES` para acciones `create` (o añadir guardrail equivalente en el prompt y en el post-proceso)

## 3. Crear el módulo de resolución de términos

- [x] 3.1 Crear `tools/services/ingest/resolve-terms.ts` con la función `resolveTerms(plan, vaultRoot, threshold)` que:
  - Carga el índice semántico de topics (`wiki/topics/**/*.md`)
  - Para cada `page_action` con `doc_type: "topic"` y `action: "create"` → convierte a `noop` con log de advertencia
  - Para cada `page_action` con `doc_type: "concept"` → busca topic más similar via embedding; si similitud ≥ threshold convierte la acción en update al topic coincidente; si no, pasa a dedup check
- [x] 3.2 Implementar dedup check dentro de `resolve-terms.ts`: si el concept pasa el topic matching, verificar si `wiki/concepts/<slug>.md` existe en disco; si existe → cambiar `create` a `update`; si no → mantener `create`
- [x] 3.3 Implementar validación de slug canónico en `resolve-terms.ts`: rechazar slugs en plural o no kebab-case, convirtiéndolos a `noop` con log de advertencia
- [x] 3.4 Añadir soporte para `TOPIC_MATCH_THRESHOLD` via variable de entorno (default `0.72`) en `tools/config.ts`

## 4. Integrar resolución de términos en ingest-run

- [x] 4.1 En `tools/ingest-run.ts`, importar `resolveTerms` desde `resolve-terms.ts`
- [x] 4.2 Invocar `resolveTerms` sobre el `llm_mutation_plan` tras `parseAndGuardrailPlan` y antes de `apply-update`
- [x] 4.3 Asegurarse de que el plan mutado por `resolveTerms` sea el que se pasa a `apply-update` y al commit

## 5. Añadir chequeo de concept-topic-candidate en health-check

- [x] 5.1 En `tools/health-check.ts`, añadir función que cuente wikilinks entrantes+salientes por concept
- [x] 5.2 Comparar el conteo con `CONCEPT_TOPIC_CANDIDATE_THRESHOLD` (default 8, configurable via `tools/config.ts`)
- [x] 5.3 Emitir entradas de tipo `"concept-topic-candidate"` en el reporte JSON/Markdown de health-check (solo aviso, sin acción automática ni modificación de archivos)

## 6. Eliminar reclassify-by-links

- [x] 6.1 Verificar que `tools/reclassify-by-links.ts` no esté referenciado en `n8n/` ni en `.github/` (encontrado en n8n/workflows/kb-answer-blueprint.json — eliminado de la workflow junto con los 7 nodos del comando reclassify)
- [x] 6.2 Eliminar `tools/reclassify-by-links.ts`
- [x] 6.3 Eliminar la entrada `reclassify-by-links` del campo `scripts` en `package.json` (no existía en scripts)
- [x] 6.4 Eliminar el binario compilado correspondiente en `dist/` si existe

## 7. Actualizar documentación

- [x] 7.1 Actualizar `AGENTS.md` para reflejar el nuevo flujo de ingestión (sin creación automática de topics, con paso de resolución de términos)
- [x] 7.2 Actualizar `README.md` eliminando referencias a `reclassify-by-links` y describiendo el nuevo comportamiento
