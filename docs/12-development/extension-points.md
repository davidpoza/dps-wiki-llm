# Puntos de extension

| Extension | Donde tocar | Precaucion |
|---|---|---|
| Nuevo proveedor LLM | Implementar `LlmClient` o ajustar `OpenAiCompatibleLlmClient` | Mantener reintentos y JSON parsing. |
| Nuevo proveedor embeddings | Implementar `EmbeddingClient` | Revisar dimension, prefijos y migracion DB. |
| Nuevo tipo de job | `JobType`, `JobController`, `JobConsumers`, servicio handler | Elegir cola de escritura o answer y snapshots si muta vault. |
| Nuevo prompt editable | Migracion `llm_prompts`, `PromptService` consumidor | No incluir secretos en prompts. |
| Nuevo flujo de extractor | `web-extractor/src/server.js` y modulo dedicado | Mantener errores tipados y tests. |
| Nueva pantalla frontend | Rutas en `main.ts`, componente, servicio API | Añadir traducciones `es/en`. |
| Nueva mutacion wiki | `MutationPlan`, guardrail, tests | No crear topics automaticamente. |
| Nuevo ajuste runtime | `AppSetting` o `AppProperties` | Documentar default y fuente. |

Fuente: estructura de backend/frontend/extractor.

