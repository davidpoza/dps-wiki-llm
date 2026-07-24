# concept-semantic-dedup Specification

## Purpose
TBD - created by archiving change ingest-concept-dedup. Update Purpose after archive.
## Requirements
### Requirement: Búsqueda semántica de conceptos similares antes de crear
Antes de aplicar una acción `create` en `wiki/concepts/`, el sistema SHALL buscar los top-3 conceptos existentes más similares usando búsqueda semántica por embeddings filtrada por `doc_type = "concept"`. Si algún resultado supera `CONCEPT_SIMILARITY_THRESHOLD` (default `0.82`, configurable), el sistema SHALL invocar al LLM judge para determinar si el candidato es el mismo concepto.

#### Scenario: Candidato semánticamente idéntico detectado
- **WHEN** el plan propone `create` en `wiki/concepts/ml.md` y la búsqueda semántica retorna `wiki/concepts/machine-learning.md` con score `0.91`
- **THEN** el sistema invoca al LLM judge con el candidato y el resultado de la búsqueda, el judge responde `{"match": "wiki/concepts/machine-learning.md"}`, y la acción se reescribe a `update` sobre `wiki/concepts/machine-learning.md`

#### Scenario: Sin similitud suficiente — se crea nuevo concepto
- **WHEN** el plan propone `create` en `wiki/concepts/vector-clock.md` y ningún concepto existente supera el umbral `0.82`
- **THEN** el sistema no invoca al LLM judge y la acción permanece como `create`

#### Scenario: LLM judge decide que no son el mismo concepto
- **WHEN** el plan propone `create` en `wiki/concepts/consistency.md` y la búsqueda retorna `wiki/concepts/idempotency.md` con score `0.84`
- **THEN** el LLM judge responde `{"match": null}` y la acción permanece como `create`

#### Scenario: Timeout en LLM judge — falla abierta
- **WHEN** la llamada al LLM judge supera 5 segundos
- **THEN** el sistema registra una advertencia, no convierte la acción, y continúa con `create` (falla abierta)

### Requirement: Prompt dedicado para el LLM judge de conceptos
El sistema SHALL usar el prompt `concept-judge-system` de la tabla `llm_prompts` para el juicio de deduplicación. El prompt SHALL instruir al modelo a responder exclusivamente JSON con la forma `{"match": "<path>"|null}`.

#### Scenario: Prompt ausente en BD
- **WHEN** la clave `concept-judge-system` no existe en `llm_prompts`
- **THEN** el sistema lanza `IllegalArgumentException` con mensaje `"Unknown prompt key: concept-judge-system"` en el startup (fallback a `@PostConstruct`)

### Requirement: Umbral de similitud configurable
El sistema SHALL leer `CONCEPT_SIMILARITY_THRESHOLD` de `app_settings` con valor por defecto `0.82`. El valor SHALL aceptar números decimales entre `0.0` y `1.0`.

#### Scenario: Umbral personalizado vía app_settings
- **WHEN** `app_settings` contiene `concept.similarity-threshold = 0.90`
- **THEN** el sistema solo convoca al LLM judge para candidatos con score `>= 0.90`

### Requirement: Resolución solo actúa sobre acciones de concepto
El `ConceptResolutionService` SHALL procesar únicamente acciones `create` cuyo path comience por `wiki/concepts/`. Otras acciones del plan (entities, analyses, sources) no se modifican.

#### Scenario: Plan con mezcla de tipos de página
- **WHEN** el plan contiene `create wiki/concepts/event-sourcing.md` y `create wiki/analyses/2024-event-driven.md`
- **THEN** solo se aplica la resolución semántica sobre el concept; la analysis se mantiene intacta

### Requirement: Alias escrito en frontmatter del concepto existente
Cuando el LLM judge confirma una coincidencia, el sistema SHALL añadir el slug propuesto originalmente a la lista `aliases` del frontmatter del concepto existente si no está ya presente.

#### Scenario: Alias nuevo añadido al concepto existente
- **WHEN** el judge redirige `ml` → `machine-learning.md` y el frontmatter de `machine-learning.md` no contiene `aliases: [ml]`
- **THEN** la acción `update` resultante incluye en su frontmatter `aliases: [...existentes, ml]`

#### Scenario: Alias ya registrado — no se duplica
- **WHEN** el frontmatter de `machine-learning.md` ya contiene `aliases: [ml]`
- **THEN** la acción `update` no modifica la lista de aliases

### Requirement: El escaneo de dedup reporta correctamente los concepts sin embedding
Durante el escaneo de duplicados, el sistema SHALL determinar qué conceptos carecen de embedding consultando directamente la tabla `document_embeddings` (JOIN con `documents` filtrado por `doc_type = "concept"` y el modelo activo). El sistema SHALL emitir un evento `concept-dedup-warning` únicamente para conceptos que no tengan fila en `document_embeddings`. Un concepto que tiene embedding pero no supera el umbral de similitud con ningún otro concepto SHALL ser reportado como `concept-dedup-scan`, no como advertencia.

#### Scenario: Concept con embedding pero sin par similar
- **WHEN** `wiki/concepts/unique-concept.md` tiene embedding en la tabla pero su similitud con todos los demás conceptos es `< 0.88`
- **THEN** el scan emite `concept-dedup-scan` para ese concept, no `concept-dedup-warning`

#### Scenario: Concept sin embedding emite advertencia correcta
- **WHEN** `wiki/concepts/orphan-concept.md` no tiene fila en `document_embeddings`
- **THEN** el scan emite `concept-dedup-warning` para ese concept

### Requirement: El escaneo de dedup envía heartbeat durante las llamadas al LLM judge
Antes de invocar al LLM judge para cada grupo de candidatos, el sistema SHALL emitir un evento de progreso `concept-dedup-judge` via SSE con el índice actual del grupo y el total de grupos. Esto mantiene la conexión SSE activa durante la fase de juicio y previene que un proxy cierre la conexión por inactividad.

#### Scenario: Heartbeat emitido antes de cada llamada al judge
- **WHEN** el scan tiene 3 grupos candidatos a juzgar y empieza el juicio del grupo 2
- **THEN** se emite un evento de progreso con `step = "concept-dedup-judge"` y `current = 2`, `total = 3` antes de llamar al LLM

### Requirement: Errores de conexión SSE no abortan el escaneo en curso
Si el cliente SSE se desconecta mientras el escaneo está en progreso (e.g., `IOException: Broken pipe` o `AsyncRequestNotUsableException`), el sistema SHALL continuar el escaneo hasta su finalización sin lanzar excepción. Los intentos de enviar eventos a un cliente desconectado SHALL ser silenciados en el controlador.

#### Scenario: Cliente desconecta durante el escaneo
- **WHEN** el cliente cierra la conexión SSE cuando el scan ha procesado 50 de 100 conceptos
- **THEN** el servidor continúa procesando los 50 restantes, el resultado se descarta silenciosamente sin loggear error, y no se lanza excepción que aborte el job

