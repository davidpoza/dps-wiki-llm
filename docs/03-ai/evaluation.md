# Evaluacion

## Cobertura automatizada existente

La evaluacion del comportamiento de IA se hace principalmente con pruebas unitarias que sustituyen clientes o repositorios:

| Area | Pruebas |
|---|---|
| Parsing JSON | `JsonExtractionServiceTests` |
| Reintentos | `RetryingLlmExecutorTests` |
| Source notes | `SourceNoteLlmServiceTests` |
| Respuestas | `AnswerPipelineServiceTests` |
| Recuperacion semantica | `SemanticRetrievalServicesTests`, `OpenAiCompatibleEmbeddingClientTests` |
| Concept resolution/dedup | `ConceptResolutionServiceTests`, `ConceptDedupScanServiceTests`, `ConceptMergeJobE2ETests` |
| Connection discovery | `ConnectionDiscoveryServiceTests` |
| Guardrails/mutacion | `MutationGuardrailServiceTests`, `MutationApplierTests` |
| Web extraction | `web-extractor/test/*.test.js` |

Fuente: `backend/src/test/java/com/dpswikillm/**`, `web-extractor/test/**`.

## No determinado o no implementado

- No se detecta benchmark offline de calidad de respuestas.
- No se detecta dataset de evaluacion para retrieval.
- No se detecta medicion persistida de coste, tokens o latencia por llamada LLM.
- No se detecta evaluador automatico de alucinaciones en respuestas.

Estas brechas se registran tambien en [preguntas abiertas](../open-questions.md).

