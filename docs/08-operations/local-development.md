# Desarrollo local

## Requisitos

| Herramienta | Uso | Fuente |
|---|---|---|
| Docker Compose | Stack completo y servicios auxiliares | `docker-compose.yml` |
| Java 21 + Maven | Backend local | `backend/pom.xml` |
| Node >=20 para web-extractor | Microservicio extractor | `web-extractor/package.json` |
| Node/pnpm | Frontend Angular | `frontend/package.json` |
| pandoc + weasyprint | Exportacion PDF si se ejecuta backend fuera del contenedor | `backend/Dockerfile`, `FileService.exportPdf` |

## Stack completo

```bash
cp .env.sample .env
docker compose up --build
```

Con el compose actual:

- frontend/proxy: `http://localhost:2141`;
- backend directo por override: `http://localhost:8090/api`;
- RabbitMQ management: `http://localhost:15672`;
- web-extractor directo por override: `http://localhost:3000`;
- TEI directo por override: `http://localhost:8080`.

Nota: el README anterior mencionaba `http://localhost:8080` para frontend/proxy, pero `docker-compose.yml` publica `2141:80`. La documentacion actual usa el compose real.

## Backend local con servicios auxiliares en Docker

```bash
docker compose up -d postgres rabbitmq embeddings web-extractor
cd backend
mvn spring-boot:run -Dspring-boot.run.jvmArguments="-Dspring.docker.compose.enabled=false -Dspring.profiles.active=local"
```

`frontend/proxy.conf.json` espera el backend local en `http://localhost:8090`.

## Frontend local

```bash
cd frontend
pnpm install
pnpm start
```

`pnpm start` ejecuta `ng serve --host 0.0.0.0` con proxy `/api` hacia `localhost:8090`.

## Web-extractor local

```bash
cd web-extractor
npm install
npm start
```

Para tests:

```bash
npm test
```

Fuente: `README.md`, `frontend/package.json`, `frontend/proxy.conf.json`, `web-extractor/package.json`, `docker-compose.yml`.

