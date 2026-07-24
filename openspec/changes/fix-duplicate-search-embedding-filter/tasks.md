## 1. Repository: query directa de embeddings por doc_type

- [x] 1.1 Añadir `findEmbeddedPathsByDocType(String model, String docType): Set<String>` a la interfaz `DocumentIndexRepository`
- [x] 1.2 Implementar el método en `JdbcDocumentIndexRepository` con `SELECT d.path FROM documents d JOIN document_embeddings de ON de.document_id = d.id WHERE d.doc_type = ? AND de.model = ?`

## 2. Servicio: corregir detección de embeddings faltantes

- [x] 2.1 En `ConceptDedupScanService.scan()`, llamar a `repository.findEmbeddedPathsByDocType(model, CONCEPT_DOC_TYPE)` y guardar el resultado en `Set<String> pathsWithEmbeddings`
- [x] 2.2 Eliminar el bloque que infería `pathsWithEmbeddings` a partir de los pares similares (el `for (SimilarPair pair : pairs)` loop)

## 3. Servicio: heartbeat SSE durante fase de juicio

- [x] 3.1 Añadir el parámetro `Consumer<ScanProgress> onProgress` al método privado `callJudge` (o crear un wrapper que emita el heartbeat antes de llamarlo)
- [x] 3.2 En el loop de grupos en `scan()`, emitir `onProgress.accept(new ScanProgress("concept-dedup-judge", paths.get(0), groupIndex, totalGroups))` antes de cada llamada al judge

## 4. Controlador: aislar errores SSE

- [x] 4.1 En `ConceptDedupController.emitProgress()`, ampliar el catch para incluir también `RuntimeException` (o capturar `Exception`) de modo que `AsyncRequestNotUsableException` no escape
- [x] 4.2 Verificar que cuando el cliente se desconecta, el error no aborta el `scan()` en curso (la excepción se traga en `emitProgress` sin relanzar)

## 5. Tests

- [x] 5.1 Actualizar `ConceptDedupScanServiceTests`: añadir test que verifica que un concepto con embedding pero sin par similar emite `concept-dedup-scan` en lugar de `concept-dedup-warning`
- [x] 5.2 Añadir test que verifica que un concepto sin fila en `document_embeddings` emite `concept-dedup-warning`

## 6. Verificación E2E

- [ ] 6.1 Lanzar el scan desde la UI y confirmar que ningún concepto con embedding muestra la advertencia "Sin embedding"
- [ ] 6.2 Verificar que la conexión SSE no se cierra prematuramente durante la fase de juicio con conceptos duplicados presentes

