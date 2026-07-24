# concept-merge-job Specification

## Purpose
TBD - created by archiving change merge-duplicate-concepts. Update Purpose after archive.
## Requirements
### Requirement: Job de tipo MERGE encolado en la cola de escritura
El sistema SHALL procesar jobs de tipo `MERGE` en la cola de escritura secuencial de RabbitMQ (misma cola que INGEST y ENRICH). El payload del job SHALL contener la lista de grupos de merge seleccionados por el usuario, donde cada grupo especifica `canonicalFilename` y `filesToMerge` (slugs de los ficheros a eliminar tras la fusión).

#### Scenario: Job MERGE encolado correctamente
- **WHEN** el usuario confirma la selección de merges y el frontend hace `POST /api/jobs` con `type = "MERGE"` y el payload de grupos
- **THEN** el sistema crea un job record con `status = QUEUED`, lo encola en RabbitMQ y responde `202 Accepted` con el job id

#### Scenario: MERGE no se ejecuta concurrentemente con otros jobs de escritura
- **WHEN** hay un job INGEST en progreso cuando se encola un job MERGE
- **THEN** el job MERGE espera en la cola hasta que el INGEST complete (prefetch=1)

### Requirement: Fusión de contenido por unión de secciones H2
Para cada grupo de merge, el sistema SHALL tomar el fichero canónico como base y añadir las secciones H2 de los ficheros secundarios que no estén ya presentes en el canónico. El frontmatter resultante SHALL ser el del fichero canónico con el campo `aliases` ampliado con los slugs de los ficheros fusionados. El sistema SHALL emitir eventos SSE de progreso por cada fichero procesado.

#### Scenario: Sección nueva del fichero secundario añadida
- **WHEN** `aprendizaje-automatico.md` tiene la sección `## Historia` y `machine-learning.md` no la tiene
- **THEN** el fichero `machine-learning.md` resultante incluye la sección `## Historia` al final

#### Scenario: Sección duplicada no se añade dos veces
- **WHEN** tanto `machine-learning.md` como `ml.md` tienen la sección `## Definición`
- **THEN** el fichero canónico mantiene solo la sección `## Definición` de `machine-learning.md`

#### Scenario: Aliases añadidos al frontmatter del canónico
- **WHEN** se fusionan `["ml", "aprendizaje-automatico"]` en `machine-learning`
- **THEN** el frontmatter de `machine-learning.md` contiene `aliases: [ml, aprendizaje-automatico]` (o los añade a los ya existentes)

### Requirement: Actualización de backlinks en todo el vault
Tras fusionar cada grupo, el sistema SHALL recorrer todos los ficheros markdown del vault y reemplazar las referencias wikilink `[[<slug-eliminado>]]` y `[[<slug-eliminado>|texto]]` por `[[<slug-canónico>]]` y `[[<slug-canónico>|texto]]` respectivamente. El reemplazo SHALL ocurrir solo fuera de bloques de código (````` ``` ````).

#### Scenario: Backlink actualizado en fichero de topic
- **WHEN** `wiki/topics/ai.md` contiene `[[aprendizaje-automatico]]` y ese slug se fusiona en `machine-learning`
- **THEN** `wiki/topics/ai.md` queda con `[[machine-learning]]`

#### Scenario: Referencia en bloque de código no se modifica
- **WHEN** `wiki/topics/ai.md` contiene dentro de un bloque de código la cadena `[[aprendizaje-automatico]]`
- **THEN** esa cadena no se modifica

### Requirement: Eliminación de ficheros secundarios y actualización del índice
Tras fusionar el contenido y actualizar backlinks, el sistema SHALL eliminar del vault los ficheros secundarios (no el canónico) y eliminar sus filas de `document_embeddings` y `documents` de la base de datos. El fichero canónico SHALL ser reindexado.

#### Scenario: Ficheros secundarios eliminados del vault
- **WHEN** el job MERGE procesa el grupo `{canonical: "machine-learning", filesToMerge: ["ml", "aprendizaje-automatico"]}`
- **THEN** `wiki/concepts/ml.md` y `wiki/concepts/aprendizaje-automatico.md` son eliminados del vault

#### Scenario: Embeddings de ficheros secundarios eliminados de la BD
- **WHEN** los ficheros secundarios son eliminados del vault
- **THEN** sus filas en `document_embeddings` y `documents` son eliminadas y el fichero canónico es reindexado con su nuevo contenido fusionado

### Requirement: Commit git por ejecución del job MERGE
El sistema SHALL crear un único commit git al finalizar la aplicación de todos los grupos de merge. El mensaje del commit SHALL indicar el número de grupos fusionados y los slugs canónicos resultantes. El job SHALL registrar el SHA previo al commit para permitir el revert.

#### Scenario: Commit creado tras el merge
- **WHEN** el job MERGE completa la fusión de 3 grupos
- **THEN** se crea un único commit git con mensaje `"merge(concepts): fuse 3 duplicate groups → [machine-learning, ...]"` y el job record almacena el pre-job SHA

#### Scenario: Job MERGE es revertible
- **WHEN** el usuario revierte el job MERGE desde el historial de jobs
- **THEN** el sistema crea un git revert del commit, restaura los ficheros secundarios eliminados, elimina la extensión de frontmatter del canónico, y restaura las filas de BD eliminadas

