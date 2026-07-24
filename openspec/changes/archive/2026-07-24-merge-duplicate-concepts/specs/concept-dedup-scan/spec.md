## ADDED Requirements

### Requirement: Endpoint SSE de escaneo de conceptos duplicados
El sistema SHALL exponer `GET /api/concept-dedup/scan` como un endpoint SSE que emite eventos de progreso mientras analiza todos los conceptos del vault buscando duplicados. El endpoint no requiere body y responde con `Content-Type: text/event-stream`. El escaneo es de solo lectura y no muta el vault ni la base de datos.

#### Scenario: Escaneo arranca y emite progreso por concept
- **WHEN** un cliente se conecta a `GET /api/concept-dedup/scan`
- **THEN** el servidor lista todos los ficheros en `wiki/concepts/`, emite un evento `PROGRESS` de tipo `{"step":"concept-dedup-scan","message":"<filepath>","result":"{\"current\":<n>,\"total\":<m>}"}` por cada concept evaluado, y cierra el stream con un evento `COMPLETED` al terminar

#### Scenario: Evento COMPLETED contiene los grupos candidatos
- **WHEN** el escaneo termina sin error
- **THEN** el servidor emite un evento SSE de tipo `COMPLETED` cuyo campo `result` es un JSON string con estructura `{"groups":[{"canonicalFilename":"<slug>","files":["<slug1>","<slug2>"],"confidence":<float>}]}`

#### Scenario: Vault sin conceptos
- **WHEN** `wiki/concepts/` está vacío o no existe
- **THEN** el servidor emite directamente el evento `COMPLETED` con `{"groups":[]}` sin emitir eventos `PROGRESS`

### Requirement: Detección por similitud de embeddings
El sistema SHALL recuperar los embeddings de todos los conceptos de la tabla `document_embeddings` (filtrando por `doc_type = "concept"`) y calcular la similitud coseno entre todos los pares. Los pares cuya similitud supere `concept.dedup-similarity-threshold` (default `0.88`, configurable vía `app_settings`) se agrupan transitivamente en grupos candidatos.

#### Scenario: Par de concepts supera el umbral
- **WHEN** `machine-learning.md` y `aprendizaje-automatico.md` tienen similitud coseno `0.91` y el umbral es `0.88`
- **THEN** ambos se añaden al mismo grupo candidato

#### Scenario: Agrupación transitiva
- **WHEN** A≈B con score `0.90` y B≈C con score `0.89`, pero A y C no se han comparado directamente
- **THEN** A, B y C forman un único grupo candidato

#### Scenario: Concept sin embedding en BD
- **WHEN** `wiki/concepts/nuevo-concepto.md` no tiene fila en `document_embeddings`
- **THEN** el sistema emite un evento SSE de tipo `PROGRESS` con `step = "concept-dedup-warning"` indicando el path y continúa el escaneo sin incluir ese concept en ningún grupo

### Requirement: Validación de grupos por LLM judge
Para cada grupo candidato con 2 o más concepts, el sistema SHALL invocar al LLM judge (prompt `concept-dedup-judge-system`) pasándole los slugs y los primeros 300 caracteres de cada fichero. El LLM SHALL responder con `{"isSameConceptGroup": true|false, "canonicalFilename": "<slug>"}`. Solo los grupos donde `isSameConceptGroup = true` se incluyen en el resultado final.

#### Scenario: LLM confirma que son el mismo concepto
- **WHEN** el LLM judge recibe el grupo `["machine-learning", "aprendizaje-automatico"]` y responde `{"isSameConceptGroup":true,"canonicalFilename":"machine-learning"}`
- **THEN** el grupo se incluye en el resultado con `canonicalFilename = "machine-learning"`

#### Scenario: LLM descarta el grupo
- **WHEN** el LLM judge responde `{"isSameConceptGroup":false,"canonicalFilename":null}`
- **THEN** el grupo no se incluye en el resultado final

#### Scenario: Timeout del LLM judge
- **WHEN** la llamada al LLM judge supera 5 segundos
- **THEN** el sistema registra una advertencia en el log, no incluye el grupo en el resultado, y continúa con el siguiente grupo

### Requirement: Normalización del canonical filename propuesto
El sistema SHALL validar que el `canonicalFilename` propuesto por el LLM esté en inglés, singular y kebab-case. Si no lo está, el sistema SHALL normalizar aplicando singularización heurística y kebab-case. Si la normalización es ambigua, el sistema SHALL conservar el filename del fichero más antiguo del grupo (por fecha de creación en git) como canonical.

#### Scenario: LLM propone slug en plural
- **WHEN** el LLM propone `canonicalFilename = "machine-learnings"`
- **THEN** el sistema lo normaliza a `machine-learning` antes de incluirlo en el resultado

#### Scenario: LLM propone slug en español
- **WHEN** el LLM propone `canonicalFilename = "aprendizaje-automatico"` pero el grupo incluye `machine-learning`
- **THEN** el sistema prefiere el slug en inglés del grupo; si todos son en otro idioma, usa el slug del fichero más antiguo
