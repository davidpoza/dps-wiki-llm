## ADDED Requirements

### Requirement: Los términos extraídos se validan contra topics existentes antes de crear concepts
Para cada término candidato (page_action de tipo concept o topic propuesto en el plan LLM), el sistema SHALL buscar en el índice semántico de topics existentes (`wiki/topics/**/*.md`) el topic más similar usando cosine similarity. Si la similitud máxima supera `TOPIC_MATCH_THRESHOLD` (default 0.72), el sistema SHALL actualizar ese topic con la información relevante y referencias, y SHALL descartar la creación de un concept para ese término.

#### Scenario: Término coincide con topic existente
- **WHEN** el plan LLM propone un concept o topic para el término "sistemas distribuidos" y existe `wiki/topics/distributed-systems.md` con similitud 0.85
- **THEN** el sistema actualiza `wiki/topics/distributed-systems.md` añadiendo la referencia a la nota fuente y descarta cualquier acción de creación de concept para ese término

#### Scenario: Término no coincide con ningún topic
- **WHEN** el plan LLM propone un concept para el término "idempotency key" y ningún topic supera similitud 0.72
- **THEN** el sistema procede a evaluar si crear o actualizar un concept para ese término

#### Scenario: Índice semántico vacío o inexistente
- **WHEN** el índice semántico no existe o no contiene topics indexados
- **THEN** el sistema SHALL saltar el paso de matching y proceder directamente a la evaluación de concepts (fail-safe, sin error)

### Requirement: No se crean topics de forma automática
El sistema SHALL prohibir cualquier acción `create` en rutas `wiki/topics/` generadas automáticamente por el LLM o por cualquier pipeline de ingestión.

#### Scenario: LLM propone crear un topic nuevo
- **WHEN** el plan LLM incluye una `page_action` con `action: "create"` y path bajo `wiki/topics/`
- **THEN** el sistema SHALL convertir esa acción en `noop` y registrar una advertencia en el log, sin lanzar excepción

#### Scenario: LLM propone actualizar un topic existente
- **WHEN** el plan LLM incluye una `page_action` con `action: "update"` a un topic que ya existe en disco
- **THEN** el sistema SHALL permitir esa acción sin restricciones

### Requirement: El paso de resolución de términos se ejecuta antes de aplicar el plan
El sistema SHALL ejecutar la resolución de términos sobre el `MutationPlan` generado por el LLM antes de invocar `apply-update`, de forma que el plan mutado sea el que se persiste y aplica.

#### Scenario: Plan con múltiples términos candidatos
- **WHEN** el plan LLM contiene 3 page_actions de concepts y 1 de topic nuevo
- **THEN** el sistema resuelve todos los términos contra el índice de topics, modifica las acciones según corresponda y aplica el plan ya resuelto

### Requirement: wiki/projects/ queda excluida de todos los pipelines automáticos
El sistema SHALL excluir todos los archivos bajo `wiki/projects/` de: indexado FTS, generación de embeddings, lint, health-check y contexto enviado al LLM durante la ingestión.

#### Scenario: Nota de proyecto presente en el vault
- **WHEN** existe `wiki/projects/my-project.md` y se ejecuta `embed-index`, `reindex`, `lint` o `health-check`
- **THEN** el archivo es ignorado completamente y no aparece en ningún resultado ni índice

#### Scenario: Ingestión con notes de proyecto en wiki_context
- **WHEN** se ejecuta `ingest-run` y el contexto de búsqueda semántica encontraría `wiki/projects/my-project.md`
- **THEN** ese archivo no se incluye en `supporting_notes` enviados al LLM
