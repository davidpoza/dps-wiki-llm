# Riesgos y limitaciones de IA

| Riesgo | Impacto | Mitigacion existente | Brecha |
|---|---|---|---|
| Respuesta LLM no verificable | El usuario podria recibir sintesis incorrecta | Prompt `answer-system` limita a contexto recuperado | No hay verificador automatico de citas o claims |
| Plan LLM inseguro | Mutacion erronea del vault | `MutationGuardrailService` y `MutationApplier` bloquean rutas y topics automaticos | El modelo puede proponer contenido pobre aunque pase guardrails |
| Keywords deficientes | Embeddings menos utiles, conexiones incorrectas | Prompt detallado + normalizacion mecanica | No hay evaluacion de calidad semantica |
| Logs con contenido sensible | Filtracion local de fuente/prompts | Configurable por `LOG_LEVEL` | `LlmMutationPlanService` loguea prompts/respuestas a `info` |
| Dimension de embeddings incorrecta | Fallos al insertar vectores | Flyway usa `${EMBED_DIMENSION}` | Cambiar dimension tras migrar requiere migracion/rebuild coordinado |
| Sidecar TEI caido | Busqueda semantica, ingestion y respuestas fallan | Health indicator y reintentos | No hay fallback lexical para `AnswerPipelineService` |
| Deduplicacion excesiva | Conceptos distintos podrian fusionarse | Prompts conservadores | Revision humana depende de UI/operador |

Fuente: `backend/src/main/java/com/dpswikillm/services/**`, `backend/src/main/resources/db/migration/**`.

