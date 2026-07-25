# ADR-0003: RabbitMQ con colas separadas para escritura y respuesta

- Estado: Inferida del codigo actual
- Fecha: 2026-07-25
- Responsables: No determinado a partir del repositorio
- Ambito: Procesamiento asincrono

## Contexto

Las operaciones de ingesta, respuesta, revision y mantenimiento pueden tardar por LLM, embeddings, I/O y WebDAV.

## Problema

Las peticiones HTTP no deben bloquear hasta terminar pipelines largos ni mezclar mutaciones concurrentes del vault.

## Opciones consideradas

### Opcion 1

RabbitMQ con `wiki-write-jobs` y `answer-jobs`.

### Opcion 2

Ejecutar todo sincronicamente en request HTTP.

### Opcion 3

Usar scheduler/thread pool interno sin broker.

## Decision

Persistir jobs en PostgreSQL, publicar mensajes RabbitMQ y consumir dos colas: escritura y respuesta.

## Justificacion

`JobQueueService` enruta `ANSWER` a `answer-jobs` y el resto a `wiki-write-jobs`; `RabbitConfig` define `prefetch=1`, un consumidor y dead-letter exchange.

## Consecuencias positivas

- Progreso observable por SSE.
- Escrituras serializadas.
- Jobs sobreviven como registros en DB.

## Consecuencias negativas

- Requiere RabbitMQ.
- Throughput de escritura limitado por diseno.

## Riesgos

- `JobConsumers` captura excepciones y marca `FAILED`; reintentos Rabbit solo ocurren si una excepcion escapa del listener.

## Criterios para revisar esta decision

- Si se necesita paralelismo de escritura con locking fino por path.

## Referencias al codigo

- `backend/src/main/java/com/dpswikillm/config/RabbitConfig.java`
- `backend/src/main/java/com/dpswikillm/services/JobQueueService.java`
- `backend/src/main/java/com/dpswikillm/services/JobConsumers.java`

