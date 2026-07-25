# Gestion de prompts

Los prompts viven en PostgreSQL en la tabla `llm_prompts`. Flyway crea los prompts iniciales y migraciones posteriores ajustan su texto sin editar migraciones ya aplicadas.

## Prompts detectados

| Key | Uso | Fuente |
|---|---|---|
| `source-note-system` | Normalizar una fuente en JSON para una source note | `SourceNoteLlmService` |
| `mutation-plan-system` | Proponer conceptos bajo `wiki/concepts/**` desde keywords/fuente | `LlmMutationPlanService` |
| `answer-system` | Sintesis de respuestas desde contexto recuperado | `AnswerPipelineService`, `ChatSessionService` |
| `keywords-system` | Generar frontmatter `keywords` para notas existentes | `KeywordGenerationService` |
| `concept-judge-system` | Decidir si un concepto propuesto coincide con uno existente | `ConceptResolutionService` |
| `concept-dedup-judge-system` | Prompt antiguo de dedup batch; no se observa uso actual en servicios | migracion `V32` |
| `concept-batch-dedup-system` | Encontrar grupos de conceptos duplicados | `ConceptDedupScanService` |
| `link-explain-system` | Explicar la relacion entre dos notas enlazadas | `LinkExplainService` |

## Edicion en runtime

La API `/api/settings/prompts` permite listar, leer y actualizar prompts. La UI consume estos endpoints desde `ApiService.getPrompts` y `ApiService.updatePrompt`.

Fuente: `PromptController.java`, `PromptService.java`, `LlmPromptRepository.java`, `frontend/src/app/services/api.service.ts`.

## Reglas importantes de prompts

- `source-note-system` fuerza contenido en espanol y keywords en ingles, singular, lowercase y kebab-case.
- `mutation-plan-system` prohibe crear `wiki/topics/**`.
- `keywords-system` limita keywords a 5-15 terminos concretos.
- Los prompts piden JSON estricto, pero el backend aun tiene parsing defensivo por si el modelo devuelve texto adicional.

Fuente: `backend/src/main/resources/db/migration/V8__llm_prompts.sql`, `V30__mutation_plan_concept_creation_prompt.sql`, `V35__update_source_note_system_prompt_v2.sql`, `V33__update_keywords_system_prompt.sql`.

