# Despliegue

## Compose recomendado por el repositorio

```bash
cp .env.sample .env
docker compose up --build
```

El compose construye backend, frontend y web-extractor localmente, y usa imagenes publicas para PostgreSQL/pgvector, RabbitMQ, TEI y nginx proxy.

## Health checks

| Servicio | Check |
|---|---|
| `postgres` | `pg_isready` |
| `rabbitmq` | `rabbitmq-diagnostics -q ping` |
| `embeddings` | `curl -sf http://localhost:8080/health` dentro del contenedor |
| `web-extractor` | `GET /health` via Node fetch |
| `backend` | `GET /api/actuator/health/readiness` |

Fuente: `docker-compose.yml`.

## Despliegue CI/CD

No determinado a partir del repositorio. No se detecta `.github/workflows` en el checkout actual.

