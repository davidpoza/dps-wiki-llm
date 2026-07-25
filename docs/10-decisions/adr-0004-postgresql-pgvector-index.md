# ADR-0004: PostgreSQL con pgvector y pg_trgm para indices

- Estado: Inferida del codigo y migraciones
- Fecha: 2026-07-25
- Responsables: No determinado a partir del repositorio
- Ambito: Persistencia e indexacion

## Contexto

El sistema necesita persistencia relacional, busqueda lexical y busqueda semantica.

## Problema

Separar indice textual y vectorial en servicios distintos aumentaria operacion; mantenerlos en PostgreSQL simplifica despliegue.

## Opciones consideradas

### Opcion 1

PostgreSQL con `pg_trgm` y `pgvector`.

### Opcion 2

Motor vectorial separado.

### Opcion 3

Indice local en disco.

## Decision

Usar PostgreSQL 17 con extensiones `vector`, `pg_trgm` y `pgcrypto`.

## Justificacion

Las migraciones crean `documents`, `document_embeddings` e indice HNSW. `JdbcDocumentIndexRepository` implementa busqueda lexical y semantica con SQL directo.

## Consecuencias positivas

- Menos componentes de persistencia.
- Transacciones y queries cerca del resto de datos.
- HNSW acelera busqueda vectorial.

## Consecuencias negativas

- Requiere imagen PostgreSQL con pgvector.
- Cambios de dimension vectorial requieren cuidado.

## Riesgos

- Una mala configuracion de `EMBED_DIMENSION` rompe inserciones o calidad.

## Criterios para revisar esta decision

- Si el volumen de documentos requiere motor vectorial dedicado.

## Referencias al codigo

- `backend/src/main/resources/db/migration/V1__extensions.sql`
- `backend/src/main/resources/db/migration/V2__documents.sql`
- `backend/src/main/resources/db/migration/V3__document_embeddings.sql`
- `backend/src/main/java/com/dpswikillm/repositories/JdbcDocumentIndexRepository.java`

