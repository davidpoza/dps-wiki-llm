## ADDED Requirements

### Requirement: Verificación de existencia antes de crear un concept
Antes de aplicar una acción `create` para un concept, el sistema SHALL verificar si ya existe un archivo en `wiki/concepts/<slug>.md` donde `<slug>` es el nombre de archivo derivado del `path` propuesto. Si el archivo existe, el sistema SHALL cambiar la acción de `create` a `update`.

#### Scenario: Concept ya existe en disco
- **WHEN** el plan resuelto contiene `page_action` con `action: "create"` y `path: "wiki/concepts/idempotency.md"`, y ese archivo ya existe
- **THEN** la acción se cambia a `update` y se aplica de forma no destructiva (merge de secciones)

#### Scenario: Concept no existe en disco
- **WHEN** el plan resuelto contiene `page_action` con `action: "create"` y `path: "wiki/concepts/idempotency.md"`, y ese archivo no existe
- **THEN** la acción permanece como `create` y se crea el archivo

### Requirement: Los slugs de concepts siguen nomenclatura canónica
El sistema SHALL validar que el slug propuesto en `page_actions[].path` para concepts sea kebab-case, en inglés y en forma singular. Slugs que no cumplan esta regla SHALL ser rechazados con log de error y la acción convertida a `noop`.

#### Scenario: Slug en plural propuesto por el LLM
- **WHEN** el plan propone `wiki/concepts/mental-models.md`
- **THEN** el sistema rechaza la acción, la convierte en `noop` y registra una advertencia indicando que el slug debe ser singular (`mental-model`)

#### Scenario: Slug correcto
- **WHEN** el plan propone `wiki/concepts/mental-model.md`
- **THEN** el sistema acepta la acción y procede con create o update según existencia del archivo

### Requirement: Advertencia en health-check para concepts candidatos a topic
El comando `health-check` SHALL calcular el número de wikilinks entrantes y salientes de cada concept. Si ese número supera `CONCEPT_TOPIC_CANDIDATE_THRESHOLD` (default 8, configurable via variable de entorno), SHALL emitir un aviso de tipo `"concept-topic-candidate"` en el reporte de resultados. El sistema no SHALL tomar ninguna acción automática sobre esos concepts.

#### Scenario: Concept con muchos enlaces detectado
- **WHEN** `wiki/concepts/event-driven-architecture.md` tiene 12 wikilinks entrantes/salientes y `CONCEPT_TOPIC_CANDIDATE_THRESHOLD` es 8
- **THEN** health-check incluye en su reporte un aviso `concept-topic-candidate` con el path del concept y el conteo de enlaces

#### Scenario: Concept con pocos enlaces
- **WHEN** `wiki/concepts/idempotency.md` tiene 3 wikilinks
- **THEN** health-check no emite ningún aviso para ese concept

### Requirement: Eliminación del comando reclassify-by-links
El script `tools/reclassify-by-links.ts` y su entrada en `package.json` SHALL ser eliminados. No se proveerá comando de reemplazo ya que la clasificación topics/concepts pasa a ser exclusivamente manual.

#### Scenario: Intento de usar reclassify-by-links
- **WHEN** se intenta ejecutar `npm run reclassify-by-links`
- **THEN** el comando no existe y falla con error de npm (script not found)
