# Objetivos y alcance

## Objetivos

- Convertir entradas crudas en notas fuente normalizadas bajo `wiki/sources/**`.
- Mantener notas atomicas y reutilizables en `wiki/concepts/**`, `wiki/entities/**`, `wiki/analyses/**` y temas manuales en `wiki/topics/**`.
- Reconstruir un indice relacional y semantico en PostgreSQL tras cambios relevantes.
- Responder preguntas usando recuperacion semantica y sintesis LLM con contexto acotado.
- Permitir revision humana de conexiones antes de aplicarlas cuando la ingesta se ejecuta en modo `validated`.
- Registrar cambios por archivo mediante snapshots reversibles.
- Ofrecer UI web autenticada para operar el sistema.

## Fuera de alcance actual

| Tema | Estado |
|---|---|
| Scheduler de mantenimiento | No hay `@Scheduled` en el backend. Las operaciones existen como endpoints manuales. |
| Feedback automatico de respuestas hacia `wiki/**` | El modelo conceptual existe en `AGENTS.md`, pero el codigo actual de `AnswerPipelineService` solo escribe `outputs/answer-<jobId>.md`. |
| CI/CD activo | No se detecta carpeta `.github/` ni workflows en el repositorio actual. |
| Busqueda hibrida en la respuesta | La respuesta usa `SemanticSearchService`; `FileLookupService` existe para lookup lexical manual. |
| Creacion automatica de topics | Prohibida por prompts, guardrails y `MutationApplier`. |

Fuente: `backend/src/main/java/com/dpswikillm/services/AnswerPipelineService.java`, `backend/src/main/java/com/dpswikillm/services/MutationGuardrailService.java`, `backend/src/main/java/com/dpswikillm/services/MutationApplier.java`, `docker-compose.yml`.

