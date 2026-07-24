## Context

La wiki acumula conceptos duplicados de ingesta en varios idiomas. Ya existe infraestructura para prevenir nuevos duplicados (`ConceptResolutionService`, embeddings, LLM judge), pero no hay mecanismo para detectar y fusionar los duplicados existentes. El sistema de jobs tiene soporte nativo para revert (git + DB). La pantalla Settings tiene espacio para controles de mantenimiento.

## Goals / Non-Goals

**Goals:**
- Detección batch de conceptos duplicados usando la infraestructura de embeddings existente
- UI en Settings con progreso SSE y selección granular de merges
- Job MERGE reversible que fusiona contenido, actualiza backlinks y normaliza filenames
- Reutilizar al máximo el código existente (SemanticSearchService, LLM judge, JobRevertService)

**Non-Goals:**
- Detección automática sin intervención del usuario (el usuario siempre aprueba los merges)
- Fusión de otros tipos de documentos (topics, analyses, sources)
- Resolución automática de conflictos de contenido entre archivos a fusionar

## Decisions

### 1. El escaneo es SSE directo, no un job de RabbitMQ

**Decisión**: `GET /api/concept-dedup/scan` devuelve un stream SSE sin pasar por la cola de jobs.

**Rationale**: El escaneo es de solo lectura, no muta el vault. No necesita persistencia en la tabla de jobs ni revert. Introducirlo en RabbitMQ añadiría complejidad sin beneficio. El patrón SSE directo ya se usa implícitamente en otros scans de health-check. Los resultados se persisten brevemente en memoria del servidor o en sesión de Angular hasta que el usuario confirma.

**Alternativa descartada**: JobType SCAN queued — añade latencia de encolado y filas huérfanas en la BD si el usuario no acepta los resultados.

### 2. Algoritmo de detección en dos fases

**Decisión**: Fase 1 (normalización + agrupación por embedding), Fase 2 (LLM judge por grupo candidato).

**Rationale**:
- **Fase 1 — Embedding similarity**: Reutiliza los embeddings ya almacenados en DB (tabla `document_embeddings`). Para cada concept, busca sus vecinos más cercanos con similitud coseno > umbral configurable (`concept.dedup-similarity-threshold`, default 0.88, más estricto que el 0.82 usado en ingesta). Agrupa transitivamente (si A≈B y B≈C, los tres forman un grupo). Coste: O(n²) sobre los embeddings en memoria; aceptable para cientos de concepts.
- **Fase 2 — LLM judge**: Para cada grupo candidato, el LLM recibe los filenames + primeros 200 caracteres de cada fichero y decide si son el mismo concepto y cuál debe ser el filename canónico. Reutiliza `concept-judge-system` prompt existente (extendido con instrucción de proponer canonical filename).

**Nombre canónico**: El LLM propone el canonical filename. El sistema lo valida y normaliza: singular, kebab-case, inglés.

### 3. Merge content strategy: union de secciones

**Decisión**: Para fusionar el contenido de N ficheros → 1 canónico, se hace un merge aditivo por secciones H2: se mantiene la sección del fichero canónico y se añaden subsecciones únicas de los otros ficheros. No se trunca contenido. Frontmatter resultante: el del canónico, con `aliases` de los slugs eliminados añadidos.

**Alternativa descartada**: LLM para fusionar contenido — demasiado lento para muchos grupos y riesgo de pérdida de información.

### 4. JobType.MERGE en la cola de escritura existente

**Decisión**: Los merges se procesan como `JobType.MERGE` en la cola `write-jobs` de RabbitMQ, igual que INGEST/ENRICH. Un commit git por ejecución del job. Revertible con `JobRevertService` existente.

**Payload del job**: Lista de grupos seleccionados. Cada grupo: `{canonicalFilename, filesToMerge: [...]}`.

**Backlinks**: Tras fusionar, el sistema recorre todos los ficheros del vault buscando wikilinks `[[filename]]` apuntando a los slugs eliminados y los reemplaza por el slug canónico.

### 5. Resultados del escaneo: transferidos en el último evento SSE

**Decisión**: El stream SSE emite eventos `PROGRESS` por cada concept evaluado y un evento final `COMPLETED` con el payload JSON de los grupos candidatos. El frontend almacena ese payload en memoria del componente modal.

**Formato del evento COMPLETED**:
```json
{
  "type": "COMPLETED",
  "result": "{\"groups\":[{\"canonicalFilename\":\"machine-learning\",\"files\":[\"machine-learning\",\"aprendizaje-automatico\",\"ml\"],\"confidence\":0.94}]}"
}
```

## Risks / Trade-offs

- **Coste del LLM judge por grupo**: Si hay muchos grupos candidatos, el escaneo puede tardar. Mitigación: umbral de similitud alto (0.88) para reducir falsos positivos; timeout de 5s por llamada (falla abierta, se excluye el grupo del resultado).
- **Backlink update brittle**: Buscar y reemplazar wikilinks por regex puede tener falsos positivos en bloques de código. Mitigación: reemplazar solo fuera de bloques de código; loggear cada reemplazo.
- **Merge de contenido con secciones duplicadas**: Si dos ficheros tienen la misma sección H2, se conserva la del fichero canónico. Puede perderse contenido del fichero secundario. El revert mitiga esto.
- **Embeddings desactualizados**: Si un concept fue creado antes de que se generasen embeddings, no aparecerá en el escaneo. Mitigación: el scan loggea concepts sin embedding como advertencia en el SSE.

## Migration Plan

1. Añadir `MERGE` a `JobType` enum (no breaking: enum aditivo).
2. Desplegar backend con nuevo endpoint SSE y handler de MERGE.
3. Desplegar frontend con el nuevo botón y modal en Settings.
4. No hay migración de datos; el primer scan se lanza manualmente.

## Open Questions

- ¿Debe el scan usar los embeddings de la BD o recalcular? (Decisión: BD; si un concept no tiene embedding, se advierte pero no bloquea.)
- ¿Debe el canonical filename ser editable por el usuario en el modal antes de confirmar? (Propuesta: sí, campo de texto editable por grupo.)
