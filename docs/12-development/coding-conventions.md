# Convenciones de codigo

## Backend

- Java 21.
- Formato Spotless con `google-java-format` estilo AOSP.
- Servicios Spring para logica de negocio.
- Repositorios JPA salvo SQL especializado en JDBC.
- DTOs como records cuando aplica.
- Excepciones especificas para errores de integracion (`WebExtractionException`, `LlmClientException`, `WebDavReplicationException`).

## Frontend

- Angular standalone components.
- Signals para estado local.
- Servicios para API y estado compartido.
- PrimeNG/Aura para UI.
- Transloco para textos.
- SCSS.

## Web-extractor

- ESM (`type: module`).
- Fastify.
- `node --test`.
- Errores tipados `ExtractionError`.

Fuente: `backend/pom.xml`, `frontend/package.json`, `web-extractor/package.json`, archivos fuente.

