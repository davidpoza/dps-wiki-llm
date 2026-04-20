## Context

El pipeline de ingestión actual delega en el LLM la creación de topics de forma completamente autónoma. Esto provoca duplicados, topics de granularidad inconsistente y fragmentación del grafo de conocimiento. El usuario es el único responsable de crear topics; la automatización solo debe enriquecerlos cuando ya existen.

El índice semántico vectorial (`state/semantic/`) ya existe y es consultable en runtime mediante `cosineSimilarity` desde `tools/lib/semantic-index.ts`. La clave es intercalar un paso de resolución de términos entre la generación del plan LLM y su aplicación.

## Goals / Non-Goals

**Goals:**
- Eliminar completamente la creación automática de topics durante ingestión.
- Introducir un paso de resolución de términos que compare cada término extraído por el LLM contra los topics existentes via embedding.
- Si un término coincide con un topic (similitud ≥ umbral) → actualizar topic y no crear concept para ese término.
- Si no coincide → verificar si existe el concept (slug kebab-case, inglés, singular) y actualizar o crear según corresponda.
- Añadir advertencia en `health-check` para concepts con alto número de enlaces (candidatos a topic manual).
- Excluir `wiki/projects/` de todos los automatismos: indexado FTS, embed, lint, health-check y pipelines de ingestión.
- Eliminar el comando `reclassify-by-links` y su entrada en `package.json`.

**Non-Goals:**
- Creación automática de topics bajo ninguna circunstancia.
- Cambios en la estructura de los archivos de topic o concept (frontmatter, secciones).
- Modificación del pipeline de `answer-run` o `search-run`.
- Cambios en el modelo de embedding o en la lógica de indexado incremental.

## Decisions

### D1: Dónde insertar la resolución de términos

**Opción A**: Modificar el prompt del LLM para que nunca proponga topics y delegarle la resolución de términos (busca en wiki_context qué topics existen).
**Opción B**: Post-procesar el plan LLM generado: extraer los `page_actions` que apunten a `wiki/topics/` y resolverlos programáticamente contra el índice semántico.
**Opción elegida: B**.

Razón: el LLM ya recibe `wiki_context` con los topics disponibles, pero no tiene acceso fiable al índice semántico ni puede garantizar que no proponga topics nuevos. Un post-proceso determinista es más robusto y auditable. El prompt del LLM se refuerza adicionalmente para que nunca proponga `create` en `wiki/topics/`.

### D2: Umbral de similitud para topic matching

Se reutiliza el umbral existente en el sistema: **cosine similarity ≥ 0.72** para topic matching (más conservador que el 0.65 de `enrich-links`, para evitar falsos positivos que asocien términos a topics equivocados).

El umbral será configurable via variable de entorno `TOPIC_MATCH_THRESHOLD` (default `0.72`).

### D3: Qué se entiende por "término extraído"

En el plan LLM, cada `page_action` que no sea la nota fuente o una entidad es un término candidato (concept o topic propuesto). La resolución de términos opera sobre la lista de `page_actions` con `doc_type: "concept"` o `doc_type: "topic"`, usando el `payload.title` como query de embedding.

### D4: Dedup de concepts

Antes de emitir una acción `create` para un concept, se comprueba si `wiki/concepts/<slug>.md` ya existe en disco. Si existe → se cambia la acción a `update`. La normalización del slug sigue la regla ya existente: kebab-case, inglés, singular.

### D5: Exclusión de `wiki/projects/`

Se añade `wiki/projects/` a la lista de exclusiones en:
- `tools/reindex.ts` (glob de archivos FTS)
- `tools/embed-index.ts` (glob de archivos a embedear)
- `tools/lint.ts` (validación estructural)
- `tools/health-check.ts` (validación semántica)
- `tools/services/ingest/build-llm-plan.ts` (contexto enviado al LLM)

### D6: Health-check — aviso de concepts candidatos a topic

Se añade un chequeo nuevo en `health-check.ts`: contar los wikilinks entrantes/salientes de cada concept. Si supera `CONCEPT_TOPIC_CANDIDATE_THRESHOLD` (default: 8, configurable), se emite un aviso de tipo `"concept-topic-candidate"` en el reporte, sin ninguna acción automática.

## Risks / Trade-offs

**[Riesgo] El índice semántico puede estar desactualizado en el momento de la resolución** → Mitigation: ejecutar `embed-index` incremental antes del paso de resolución de términos dentro de `ingest-run.ts`; si el índice no existe o está vacío, saltar el matching y proceder como si no hubiese topic coincidente (fail-safe).

**[Riesgo] El post-proceso de `page_actions` filtra acciones que el LLM consideró importantes** → Mitigation: el sistema solo bloquea acciones `create` en topics; las acciones `update` a topics existentes se permiten siempre. Si el LLM propone `create` en un topic y no se encuentra coincidencia en el índice, se convierte en una acción `noop` con log de advertencia (no se lanza excepción).

**[Riesgo] Eliminar `reclassify-by-links` rompe flujos externos (n8n, scripts)** → Mitigation: verificar en `n8n/` y `.github/` que no haya referencias al script antes de eliminarlo.

## Migration Plan

1. Actualizar el prompt en `build-llm-plan.ts`: prohibir explícitamente `create` en `wiki/topics/`.
2. Crear `tools/services/ingest/resolve-terms.ts`: lógica de resolución de términos (embedding lookup + dedup check).
3. Integrar `resolve-terms` en `ingest-run.ts` tras `parseAndGuardrailPlan`.
4. Añadir exclusión de `wiki/projects/` en reindex, embed-index, lint, health-check y build-llm-plan.
5. Añadir chequeo `concept-topic-candidate` en `health-check.ts`.
6. Eliminar `tools/reclassify-by-links.ts` y su entrada en `package.json`.
7. Verificar que no haya referencias a `reclassify-by-links` en n8n o GitHub Actions.
8. Actualizar `AGENTS.md` y `README.md` para reflejar el nuevo flujo.
