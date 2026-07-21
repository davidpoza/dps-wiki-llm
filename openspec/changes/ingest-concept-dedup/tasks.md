## 1. DB Migrations y configuración

- [x] 1.1 Crear migración `V26__concept_judge_prompt.sql` — insertar prompt `concept-judge-system` en `llm_prompts` con instrucción de responder JSON `{"match":"<path>"|null}`
- [x] 1.2 Crear migración `V27__concept_similarity_threshold.sql` — insertar `concept.similarity-threshold = 0.82` en `app_settings`
- [x] 1.3 Actualizar el prompt `mutation-plan-system` (nueva migración `V28__mutation_plan_slug_normalization.sql`) para instruir que los slugs de concepts sean inglés singular kebab-case

## 2. Normalización de slugs en MutationGuardrailService

- [x] 2.1 Añadir heurística de singularización en `MutationGuardrailService`: para paths `wiki/concepts/`, intentar convertir slug en plural a singular antes de rechazar
- [x] 2.2 Añadir log `INFO` cuando se normaliza un slug automáticamente y `WARN` cuando no se puede derivar el singular (acción → `noop`)
- [x] 2.3 Actualizar tests de `MutationGuardrailService` para cubrir: slug plural derivable, slug plural ambiguo, slug correcto sin cambios

## 3. ConceptResolutionService — núcleo

- [x] 3.1 Crear `ConceptResolutionService` con dependencias: `SemanticSearchService`, `LlmClient`, `PromptService`, `MarkdownService`
- [x] 3.2 Implementar `resolve(MutationPlan, String sourceNotePath) → MutationPlan`: itera sobre acciones `create` en `wiki/concepts/`, aplica búsqueda semántica y reescribe a `update` si el judge confirma match
- [x] 3.3 Implementar lectura del umbral desde `app_settings` vía `ResourceSettingsService` (o equivalente); usar `0.82` como fallback si no existe la clave
- [x] 3.4 Implementar LLM judge: prompt `concept-judge-system`, parseo JSON de respuesta, manejo de timeout (5 s) con falla abierta (`create` sin cambio)
- [x] 3.5 Implementar actualización de `aliases` en frontmatter: leer el concept existente, mergear el slug propuesto a la lista `aliases` si no está presente, incluirlo en la acción `update`

## 4. Integración en IngestPipelineService

- [x] 4.1 Inyectar `ConceptResolutionService` en `IngestPipelineService`
- [x] 4.2 Añadir paso `concept-resolution` entre `guardrailService.guardrail(...)` y `mutationApplier.apply(...)` para el plan de conexiones
- [x] 4.3 Añadir evento de ciclo de vida (`lifecycleService.transition`) para el nuevo paso con estado `PROGRESS` y mensaje `"Resolving concept duplicates"`

## 5. Tests

- [x] 5.1 Crear `ConceptResolutionServiceTests`: caso sinónimo detectado (mock SemanticSearch + LLM judge), caso sin similitud suficiente, caso timeout del judge, caso con `aliases` ya existente en frontmatter
- [x] 5.2 Añadir test de integración en `IngestPipelineServicesTests` que verifique que un plan con concept duplicado semántico resulta en `update` en lugar de `create`
- [x] 5.3 Verificar que el umbral configurable es leído correctamente en tests con valor distinto al default
