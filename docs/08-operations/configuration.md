# Configuracion operativa

## Variables principales

| Variable | Requerida en produccion | Uso |
|---|---|---|
| `SPRING_DATASOURCE_URL` | si | JDBC PostgreSQL. |
| `SPRING_DATASOURCE_USERNAME` | si | Usuario DB. |
| `SPRING_DATASOURCE_PASSWORD` | si | Password DB. |
| `SPRING_RABBITMQ_HOST` | si | Host RabbitMQ. |
| `LLM_BASE_URL` | si | Endpoint OpenAI-compatible. |
| `LLM_MODEL` | si | Modelo chat. |
| `LLM_API_KEY` | depende proveedor | Bearer token para chat. |
| `EMBED_BASE_URL` | si | Endpoint TEI. |
| `EMBED_MODEL` | si | Nombre persistido junto a embeddings. |
| `EMBED_DIMENSION` | si | Debe coincidir con migracion `document_embeddings`. |
| `JWT_SECRET` | si | Base64 de al menos 32 bytes decodificados. |
| `ADMIN_USERNAME` | si para seed | Usuario admin inicial. |
| `ADMIN_PASSWORD` | si para seed | Password admin inicial. |
| `VAULT_PATH` | si | Root del vault. |
| `CORS_ALLOWED_ORIGINS` | si | Origenes permitidos. |
| `WEBDAV_URL` | no | Activa WebDAV si no esta vacia. |
| `TELEGRAM_BOT_TOKEN` | no | Activa bot si esta configurado. |

## Secretos

No usar defaults de desarrollo en produccion:

- `JWT_SECRET`;
- `ADMIN_PASSWORD`;
- credenciales DB/RabbitMQ;
- `LLM_API_KEY`;
- `WEBDAV_PASSWORD`;
- `TELEGRAM_BOT_TOKEN`.

Fuente: `.env.sample`, `application.yml`, `JwtUtil.java`, `UserService.java`.

