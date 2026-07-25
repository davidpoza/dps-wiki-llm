# Deuda tecnica

| Deuda | Evidencia | Impacto |
|---|---|---|
| Health-check muta `Related` automaticamente | `HealthCheckService.applyConnections` aplica reemplazos de seccion calculados por semantic search | Requiere operacion cuidadosa para no sobrescribir links manuales si no estan en computed |
| No hay fallback lexical para respuestas | `AnswerPipelineService` usa solo `SemanticSearchService` | TEI/pgvector caidos impiden respuesta |
| Logs LLM a `info` en plan de mutacion | `LlmMutationPlanService` | Posible exposicion de contenido |
| Frontend sin tests detectables | no se hallan `*.spec.ts` | Riesgo en cambios UI |
| CI/CD no detectado | no hay `.github/` | Calidad depende de ejecucion local |
| Servicio de chat exporta a `outputs/**` sin snapshot | `ChatSessionVaultExportService` escribe directo | Historial no captura esos exports |

Fuente: archivos indicados.
