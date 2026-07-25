# Deuda tecnica

| Deuda | Evidencia | Impacto |
|---|---|---|
| Documentacion previa obsoleta de scripts/n8n | `docs/architecture.md`, `docs/production-runbook.md` hablaban de `tools/*.ts` no presentes | Confusion de onboarding |
| Health-check muta `Related` automaticamente | `HealthCheckService.applyComputed` reemplaza secciones | Requiere operacion cuidadosa para no sobrescribir links manuales si no estan en computed |
| No hay fallback lexical para respuestas | `AnswerPipelineService` usa solo `SemanticSearchService` | TEI/pgvector caidos impiden respuesta |
| Logs LLM a `info` en plan de mutacion | `LlmMutationPlanService` | Posible exposicion de contenido |
| Frontend sin tests detectables | no se hallan `*.spec.ts` | Riesgo en cambios UI |
| CI/CD no detectado | no hay `.github/` | Calidad depende de ejecucion local |
| Servicio de chat exporta a `outputs/**` sin snapshot | `ChatSessionVaultExportService` escribe directo | Historial no captura esos exports |

Fuente: archivos indicados.

