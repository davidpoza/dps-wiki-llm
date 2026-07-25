# End-to-end tests

No se detecta suite E2E de navegador versionada para el frontend. El repositorio si permite validacion manual end-to-end con Docker Compose.

## Escenario manual verificable

1. Levantar stack:

```bash
docker compose up --build
```

2. Abrir `http://localhost:2141`.
3. Entrar con `ADMIN_USERNAME`/`ADMIN_PASSWORD`.
4. Ingestar Markdown o URL.
5. Observar progreso en Jobs.
6. Verificar nota en Explorer bajo `wiki/sources/**`.
7. Ejecutar pregunta en Chat o `/api/answer`.
8. Revisar `outputs/answer-<jobId>.md`.

No se automatiza este flujo en el checkout actual.

Fuente: `docker-compose.yml`, `frontend/src/main.ts`, `JobController.java`, `AnswerPipelineService.java`.

