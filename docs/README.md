# Documentacion del proyecto

Esta carpeta contiene la documentacion tecnica y arquitectonica de `dps-wiki-llm`.
Esta escrita para que un desarrollador nuevo pueda entender el sistema, ejecutarlo y modificarlo sin romper la separacion entre ingesta (`raw/`) y conocimiento curado (`wiki/`).

## Mapa de lectura

| Necesidad | Documento |
|---|---|
| Entender que problema resuelve | [Vision del proyecto](01-introduction/project-overview.md) |
| Conocer objetivos y limites | [Objetivos y alcance](01-introduction/goals-and-scope.md) |
| Leer la arquitectura completa | [Resumen de arquitectura](02-architecture/architecture-overview.md) |
| Ver diagramas C4 y flujos | [Contexto](02-architecture/system-context.md), [Contenedores](02-architecture/containers.md), [Componentes](02-architecture/components.md), [Flujos de ejecucion](02-architecture/runtime-flows.md) |
| Entender IA, prompts y embeddings | [Arquitectura de IA](03-ai/ai-architecture.md) |
| Revisar modelo de datos | [Modelo de datos](04-data/data-model.md) |
| Consultar API HTTP | [Endpoints](05-api/endpoints.md) |
| Ejecutar localmente | [Desarrollo local](08-operations/local-development.md) |
| Configurar despliegue | [Configuracion operativa](08-operations/configuration.md) y [Despliegue](08-operations/deployment.md) |
| Modificar backend | [Arquitectura backend](07-backend/backend-architecture.md) y [Servicios](07-backend/services.md) |
| Modificar frontend | [Arquitectura frontend](06-frontend/frontend-architecture.md) |
| Ver decisiones tecnicas | [ADRs](10-decisions/README.md) |
| Riesgos y deuda | [Riesgos conocidos](11-quality/known-risks.md) y [Deuda tecnica](11-quality/technical-debt.md) |
| Dudas reales pendientes | [Preguntas abiertas](open-questions.md) |

## Principios documentados

- `raw/**` es la capa de eventos de entrada.
- `wiki/**` es estado derivado y curado.
- La automatizacion no crea `wiki/topics/**`.
- Las mutaciones del vault pasan por servicios Spring, guardrails, snapshots e indices.
- Las respuestas escriben artefactos en `outputs/**`, pero no modifican directamente `wiki/**`.

Fuentes principales:

- `AGENTS.md`
- `README.md`
- `docker-compose.yml`
- `backend/src/main/java/com/dpswikillm/**`
- `backend/src/main/resources/db/migration/**`
- `frontend/src/app/**`
- `web-extractor/src/**`

