# ADR-0006: TEI sidecar para embeddings

- Estado: Inferida del codigo y Compose
- Fecha: 2026-07-25
- Responsables: No determinado a partir del repositorio
- Ambito: Recuperacion semantica

## Contexto

La recuperacion semantica necesita embeddings consistentes para documentos y queries.

## Problema

El backend Java no deberia cargar modelos ML directamente si puede delegarlo a un sidecar especializado.

## Opciones consideradas

### Opcion 1

TEI sidecar con `multilingual-e5-small`.

### Opcion 2

Embeddings por API externa.

### Opcion 3

Modelo embebido dentro del backend.

## Decision

Ejecutar TEI como contenedor `embeddings` y llamarlo desde `OpenAiCompatibleEmbeddingClient`.

## Justificacion

Compose define `ghcr.io/huggingface/text-embeddings-inference:cpu-1.7` con `intfloat/multilingual-e5-small`; el cliente usa `/embed` con normalizacion.

## Consecuencias positivas

- Backend simple.
- Misma API para queries y passages.
- Control local del modelo por Compose.

## Consecuencias negativas

- Arranque del sidecar puede ser lento.
- Otro servicio a operar.

## Riesgos

- Cambio de modelo/dimension debe coordinarse con pgvector.

## Criterios para revisar esta decision

- Si se migra a embeddings externos o se requiere GPU.

## Referencias al codigo

- `docker-compose.yml`
- `backend/src/main/java/com/dpswikillm/services/OpenAiCompatibleEmbeddingClient.java`
- `backend/src/main/java/com/dpswikillm/services/EmbeddingIndexService.java`

