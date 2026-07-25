# Migraciones

Flyway esta habilitado y Hibernate valida el esquema:

```yaml
spring:
  jpa:
    hibernate:
      ddl-auto: validate
  flyway:
    enabled: true
```

Las migraciones viven en `backend/src/main/resources/db/migration/`.

## Evolucion del esquema

| Rango | Cambio |
|---|---|
| `V1`-`V3` | Extensiones PostgreSQL, `documents`, `document_embeddings` con HNSW. |
| `V4`-`V6` | Jobs, operaciones y candidatos de conexion. |
| `V7`-`V12` | Usuarios, prompts, 2FA y login events. |
| `V13`-`V20` | Snapshots, snapshot files y correcciones WebDAV. |
| `V21`-`V38` | Settings, prompts de keywords/source/concepts/link-explain, chat sessions y dedup. |

## Comando

No hay comando Flyway standalone documentado en el repositorio. Las migraciones se ejecutan al arrancar el backend Spring Boot.

Fuente: `backend/src/main/resources/application.yml`, `backend/src/main/resources/db/migration/*.sql`.

