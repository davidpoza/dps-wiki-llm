## Why

El flujo de ingestión actual es inestable porque el LLM crea topics automáticamente, generando duplicados, solapamientos y fragmentación del grafo de conocimiento. Los topics deben ser estructuras controladas por el usuario; la automatización solo debe enriquecer lo que ya existe o crear concepts de menor granularidad.

## What Changes

- **BREAKING** Eliminación de la creación automática de topics durante ingestión (ingest, enrich y cualquier pipeline).
- Nuevo paso de resolución de términos: cada término clave extraído por el LLM se valida primero contra los topics existentes via embedding antes de decidir si se crea un concept.
- Si un término supera el umbral de similitud con un topic existente → se actualiza el topic (referencias, secciones) y **no** se crea concept para ese término.
- Si no hay topic coincidente → se valora crear o actualizar un concept (slugs kebab-case, inglés, singular), nunca un topic nuevo.
- **BREAKING** Eliminación del comando `reclassify-by-links` (ya no tiene sentido si los topics son solo manuales).
- El comando `health-check` añade una advertencia (solo aviso, sin acción automática) cuando un concept acumula un número elevado de enlaces entrantes/salientes, señalándolo como candidato a topic manual.
- Las notas en `wiki/projects/` quedan completamente excluidas de todos los automatismos y pipelines.

## Capabilities

### New Capabilities

- `term-topic-resolution`: Lógica de resolución de términos extraídos por el LLM: primero compara con topics via embedding, luego decide si crear/actualizar concept o enriquecer topic existente.
- `concept-dedup-check`: Antes de crear un concept, verifica si ya existe un archivo con el mismo slug (o slug equivalente) y actualiza en lugar de duplicar.

### Modified Capabilities

- `structured-logging`: No aplica cambios de requisitos en este ámbito.

## Impact

- `tools/ingest-run.ts` — eliminar lógica de creación de topics; añadir paso de resolución de términos.
- `tools/services/ingest/build-llm-plan.ts` — ajustar prompt/plan para no proponer topics nuevos.
- `tools/reclassify-by-links.ts` — eliminar archivo y entrada en package.json.
- `tools/health-check.ts` — añadir chequeo de concepts con alto número de enlaces (aviso).
- `tools/embed-index.ts` / `tools/lib/semantic-index.ts` — reutilizar para la resolución de términos en tiempo de ingestión.
- `wiki/projects/` — añadir exclusión explícita en todos los pasos de indexado, embed, lint y health-check.
- `package.json` — eliminar script `reclassify-by-links`.
