# Roadmap tecnico

No se detecta roadmap oficial versionado. Estos items son inferencias basadas en brechas reales del repositorio:

| Item | Tipo |
|---|---|
| Anadir CI para backend, frontend y web-extractor | Inferencia basada en ausencia de `.github/`. |
| Automatizar E2E UI | Inferencia basada en ausencia de specs E2E. |
| Medir coste, tokens y latencia LLM | Inferencia basada en servicios de IA sin persistencia de metricas. |
| Fallback lexical para respuestas cuando embeddings fallen | Inferencia basada en `AnswerPipelineService` usando solo semantic search. |
| Revisar logging de prompts/respuestas a nivel `info` | Inferencia basada en `LlmMutationPlanService`. |
| Formalizar backup/restore | Inferencia basada en ausencia de scripts. |

