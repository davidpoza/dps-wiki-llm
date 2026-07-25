# Monitorizacion

## Expuesto por la aplicacion

- Actuator `health` e `info`.
- Health indicator especifico para embeddings (`EmbeddingsHealthIndicator`).
- SSE para progreso de jobs y tareas manuales. Health Check emite progreso como job `HEALTH_CHECK`.
- Logs SLF4J controlados por `LOG_LEVEL`.

## No observado

- No hay metricas Prometheus expuestas.
- No hay tracing distribuido.
- No hay dashboard de observabilidad versionado.
- No hay persistencia de latencia/coste por llamada LLM.

Fuente: `application.yml`, `EmbeddingsHealthIndicator.java`, `JobEventService.java`.
