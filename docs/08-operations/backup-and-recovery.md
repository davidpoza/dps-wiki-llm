# Backup y recuperacion

## Que respaldar

| Recurso | Motivo |
|---|---|
| Vault (`VAULT_PATH`) | Contiene `raw/`, `wiki/`, `outputs/`, `state/` e `INDEX.md`. |
| Base PostgreSQL | Contiene usuarios, prompts editados, jobs, snapshots, embeddings y WebDAV baselines. |
| `.env`/secret store | Necesario para volver a conectar DB, LLM, WebDAV, Telegram y JWT. |

## Recuperacion por snapshot

Para cambios de jobs o ediciones manuales que pasaron por servicios, `SnapshotService` permite:

- listar historial;
- obtener diffs;
- recuperar versiones;
- hard reset de archivos capturados durante un snapshot;
- encolar reversión de job con `/api/jobs/{id}/revert`.

## Limitaciones

- Los snapshots viven en PostgreSQL; no sustituyen backup de la base.
- No se detecta script de backup/restauracion automatica.
- Archivos modificados fuera de los servicios pueden no tener snapshot.

Fuente: `SnapshotService.java`, `JobRevertService.java`, `FileService.java`.

