# Manejo de errores API

## Errores globales

`GlobalExceptionHandler` cubre:

| Excepcion | Estado | Body |
|---|---:|---|
| `HttpStatusException` | 422 | `{ "error": "URL fetch failed with HTTP ..." }` |
| `WebExtractionException` con code `service_unavailable` | 503 | `{ "error": code, "message": message }` |
| Otros `WebExtractionException` | 422 | `{ "error": code, "message": message }` |

## Errores por controlador

Varios controladores devuelven manualmente:

- `400` para path invalido, input invalido o tipo de fichero no soportado;
- `401` para token ausente/invalido o credenciales incorrectas;
- `404` para recurso no encontrado;
- `409` para conflictos de nombre o estado;
- `502` cuando un save local se completo pero la replica WebDAV fallo;
- `202` cuando un job se encola.

## Jobs

Los errores de pipeline se registran en `jobs.error` y se publican por SSE con estado `FAILED`. En ingesta, `PipelineTx` intenta restaurar archivos/ledger/snapshot antes de marcar fallo.

Fuente: `GlobalExceptionHandler.java`, `FileController.java`, `AuthController.java`, `JobConsumers.java`, `IngestPipelineService.java`.

