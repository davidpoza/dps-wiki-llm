# Persistencia

## Capas persistentes

| Capa | Ubicacion | Propietario |
|---|---|---|
| Vault markdown | `VAULT_PATH` / `/vault` en Docker | Servicios de vault e ingesta |
| PostgreSQL | servicio `postgres` | JPA/JDBC/Flyway |
| RabbitMQ | servicio `rabbitmq` | Colas transitorias de jobs |
| WebDAV | externo opcional | `WebDavSyncService` |

## Vault

`VaultPathResolver` define el limite del filesystem. `FileService` expone lectura, escritura, creacion, borrado, renombrado, movimiento, subida de imagenes y exportacion PDF. Las escrituras manuales crean snapshots con `source = LOCAL_EDIT`.

## PostgreSQL

JPA se usa para entidades de aplicacion (`users`, `jobs`, `snapshots`, etc.). JDBC directo se usa para el indice documental y pgvector mediante `JdbcDocumentIndexRepository`, porque las consultas vectoriales y `pg_trgm` se expresan directamente en SQL.

## Consistencia

Las mutaciones de ingesta envuelven escritura de archivos y snapshots en `PipelineTx` con acciones compensables. La transaccion de base de datos no puede cubrir atomicamente el filesystem, por lo que el rollback restaura:

- ledger de idempotencia;
- snapshot;
- archivos capturados.

Fuente: `IngestPipelineService.java`, `PipelineTx.java`, `SnapshotService.java`, `JdbcDocumentIndexRepository.java`.

