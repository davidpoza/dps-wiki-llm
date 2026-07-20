## ADDED Requirements

### Requirement: Paso dedicado de descubrimiento de conexiones con topics
Durante la fase de *connection discovery*, además de la búsqueda semántica general y de los candidatos del plan LLM, el sistema SHALL ejecutar una búsqueda semántica **restringida a documentos de tipo `topic`** (`wiki/topics/**/*.md`, identificados por `doc_type = 'topic'` en el índice). La consulta SHALL derivarse de las keywords de la nota fuente y, en su defecto, de su título. Los resultados SHALL filtrarse por un umbral propio `TOPIC_CONNECTION_THRESHOLD` (default 0.72) y limitarse a un cupo propio `TOPIC_CONNECTION_LIMIT` (default 3), de forma independiente al top-N de la búsqueda general, para que los topics no compitan contra las notas fuente.

#### Scenario: Existe un topic relevante para la nota fuente
- **WHEN** se ingesta una nota fuente sobre "transformers y LLM" y `wiki/topics/ai.md` supera el umbral `TOPIC_CONNECTION_THRESHOLD`
- **THEN** el sistema genera un candidato de conexión hacia `wiki/topics/ai.md` con origen `topic`, aunque ese topic no estuviera entre los resultados de la búsqueda semántica general

#### Scenario: Ningún topic supera el umbral
- **WHEN** ningún documento de tipo `topic` alcanza `TOPIC_CONNECTION_THRESHOLD` para la consulta derivada de la nota fuente
- **THEN** el paso dedicado de topics no genera candidatos y el resto del descubrimiento continúa sin error

#### Scenario: Índice semántico sin topics
- **WHEN** el índice no contiene documentos de tipo `topic`
- **THEN** el paso dedicado de topics se salta de forma segura (fail-safe) y no interrumpe el pipeline

### Requirement: Origen `topic` en los candidatos de conexión
El enum `ConnectionCandidateSource` SHALL incluir el valor `topic`, y los candidatos generados por el paso dedicado de topics SHALL persistirse con `source = topic` en `job_connection_candidates`, de modo que la revisión guiada y las métricas puedan distinguirlos de los orígenes `semantic` y `llm`.

#### Scenario: Persistencia del origen del candidato
- **WHEN** el paso dedicado genera un candidato hacia una nota de `wiki/topics/`
- **THEN** el candidato persistido tiene `source = topic`

#### Scenario: No se duplica un topic ya propuesto por otro origen
- **WHEN** el mismo `targetPath` de topic ya fue propuesto por la búsqueda semántica general o por el plan LLM
- **THEN** no se crea un candidato duplicado para esa misma nota destino

### Requirement: Enlace inverso (backlink) garantizado en todos los flujos
Cuando se materializa una conexión aceptada entre la nota fuente y una nota enlazada, el sistema SHALL insertar el enlace en **ambos sentidos**: `[[nota-fuente]]` en la nota enlazada y `[[nota-enlazada]]` en la nota fuente. Este comportamiento bidireccional SHALL aplicarse de forma consistente tanto en el **modo desatendido** como en el **flujo de revisión guiada**, eliminando el hueco actual en el que la revisión guiada solo inserta un sentido.

#### Scenario: Aceptación en revisión guiada
- **WHEN** en modo validado el usuario acepta un candidato de conexión hacia `wiki/topics/ai.md`
- **THEN** `wiki/topics/ai.md` recibe `[[<nota-fuente>]]` y, además, la nota fuente recibe `[[wiki/topics/ai.md]]` como enlace inverso

#### Scenario: Conexión en modo desatendido
- **WHEN** en modo desatendido se aplica un candidato aceptado automáticamente
- **THEN** la nota fuente y la nota enlazada quedan enlazadas en ambos sentidos

### Requirement: Idempotencia de los enlaces de conexión
La inserción de los enlaces de conexión (directo e inverso) SHALL ser idempotente: reaplicar la misma conexión sobre notas que ya contienen el enlace NO SHALL crear entradas duplicadas.

#### Scenario: Reaplicación de una conexión existente
- **WHEN** una nota fuente y una nota enlazada ya contienen mutuamente el enlace y se vuelve a aplicar la misma conexión
- **THEN** el contenido de ambas notas permanece sin enlaces duplicados
