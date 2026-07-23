## 1. Backend — Setup y datos

- [x] 1.1 Añadir `MERGE` al enum `JobType`
- [x] 1.2 Añadir prompt `concept-dedup-judge-system` a la tabla `llm_prompts` (instrucción: agrupar N concepts y proponer canonical filename en inglés singular kebab-case; responder JSON `{"isSameConceptGroup":bool,"canonicalFilename":str|null}`)
- [x] 1.3 Añadir setting `concept.dedup-similarity-threshold` (default `0.88`) al seeder de `app_settings`

## 2. Backend — Servicio de escaneo (`ConceptDedupScanService`)

- [x] 2.1 Implementar carga de todos los embeddings de concepts desde `document_embeddings` (`doc_type = "concept"`)
- [x] 2.2 Implementar cálculo de similitud coseno por pares y agrupación transitiva por umbral configurable
- [x] 2.3 Implementar invocación al LLM judge por grupo candidato (con timeout de 5s, falla abierta)
- [x] 2.4 Implementar normalización del `canonicalFilename` propuesto (singular, kebab-case, inglés heurístico; fallback al fichero más antiguo en git)
- [x] 2.5 Añadir tratamiento de concepts sin embedding: emitir evento `PROGRESS` con `step = "concept-dedup-warning"` y continuar

## 3. Backend — Endpoint SSE de escaneo

- [x] 3.1 Crear `ConceptDedupController` con `GET /api/concept-dedup/scan` que retorna `SseEmitter`
- [x] 3.2 Emitir evento `PROGRESS` con `step = "concept-dedup-scan"`, `message = <filepath>`, `result = {"current":<n>,"total":<m>}` por cada concept evaluado
- [x] 3.3 Emitir evento `COMPLETED` con `result = JSON.stringify({groups:[...]})` al finalizar
- [x] 3.4 Emitir evento `ERROR` y cerrar el emitter ante excepciones no controladas

## 4. Backend — Handler del job MERGE (`ConceptMergeJobHandler`)

- [x] 4.1 Crear `ConceptMergeJobHandler` que recibe el payload `{groups:[{canonicalFilename,filesToMerge:[...]}]}`
- [x] 4.2 Implementar fusión de contenido por unión de secciones H2 (base = fichero canónico, añadir secciones únicas de secundarios)
- [x] 4.3 Implementar actualización de frontmatter del canónico: añadir slugs eliminados a `aliases`
- [x] 4.4 Implementar actualización de backlinks `[[slug-eliminado]]` → `[[slug-canónico]]` en todo el vault, excluyendo bloques de código
- [x] 4.5 Implementar eliminación de ficheros secundarios del vault y de sus filas en `documents` + `document_embeddings`
- [x] 4.6 Implementar reindexado del fichero canónico tras la fusión
- [x] 4.7 Crear único commit git al finalizar todos los grupos; almacenar pre-job SHA en el job record
- [x] 4.8 Registrar el handler en `JobConsumers` para `JobType.MERGE`
- [x] 4.9 Emitir eventos SSE de progreso (`PROGRESS` por fichero procesado) vía `JobEventService`

## 5. Backend — Revert del job MERGE

- [x] 5.1 Verificar que `JobRevertService` maneja `JobType.MERGE` correctamente (git revert + restauración de filas de BD eliminadas)
- [x] 5.2 Añadir tests de integración para el revert de un MERGE job (git revert + restauración de embeddings)

## 6. Frontend — Modal de deduplicación

- [x] 6.1 Crear componente `ConceptDedupModalComponent` (Angular, dos fases: scanning / results)
- [x] 6.2 Fase scanning: conectar a `GET /api/concept-dedup/scan` vía SSE, mostrar barra de progreso, filepath actual y contador "n / m"
- [x] 6.3 Fase scanning: mostrar lista de warnings (concepts sin embedding) debajo de la barra
- [x] 6.4 Fase scanning: manejar error de conexión SSE con mensaje y botón "Retry"
- [x] 6.5 Fase results: transicionar al recibir evento `COMPLETED`; parsear el JSON de grupos
- [x] 6.6 Fase results: renderizar lista de grupos con checkbox (marcado por defecto), slugs fuente, flecha "→", y canonical filename editable
- [x] 6.7 Fase results: mostrar "No duplicate concepts found." si `groups` está vacío
- [x] 6.8 Fase results: botón "Merge selected" habilitado solo cuando ≥1 checkbox marcado; al pulsar, hace `POST /api/jobs` con `type = MERGE` y los grupos seleccionados
- [x] 6.9 Fase results: tras encolado exitoso, mostrar confirmación con job id y enlace "View in jobs history"

## 7. Frontend — Integración en Settings

- [x] 7.1 Añadir sección "Maintenance" en la pantalla Settings con botón "Find duplicate concepts"
- [x] 7.2 Deshabilitar el botón si hay un job `MERGE` con estado `QUEUED` o `STARTED` (consultar jobs activos al cargar la pantalla)
- [x] 7.3 Al pulsar el botón, abrir `ConceptDedupModalComponent`

## 8. Tests y verificación

- [x] 8.1 Tests unitarios de `ConceptDedupScanService`: agrupación transitiva, timeout del LLM judge, normalización del canonical filename
- [x] 8.2 Test E2E del flujo completo: escaneo SSE → modal de resultados → job MERGE → revert
