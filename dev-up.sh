#!/usr/bin/env bash
# Levanta SOLO las dependencias de desarrollo local (Postgres, RabbitMQ,
# embeddings TEI y web-extractor) compartiendo la red de ESTE contenedor de
# workspace, para que el backend las vea en localhost.
#
# Util si quieres arrancar el backend por tu cuenta (p.ej. desde el IDE). Para
# arrancar backend + dependencias de una sola vez, usa ./dev-backend.sh
set -euo pipefail
cd "$(dirname "$0")"

export DEV_NETNS_CONTAINER="$(hostname)"
docker compose -f compose.local.yaml up -d

# Espera a Postgres y RabbitMQ (críticos para el arranque del backend).
echo -n "Esperando a Postgres"
for _ in $(seq 1 60); do
  if docker exec dpswiki-db-local pg_isready -U dps_wiki -d dps_wiki >/dev/null 2>&1; then
    echo " OK"; break
  fi
  echo -n "."; sleep 1
done

echo -n "Esperando a RabbitMQ"
for _ in $(seq 1 60); do
  if docker exec dpswiki-rabbitmq-local rabbitmq-diagnostics -q ping >/dev/null 2>&1; then
    echo " OK"; break
  fi
  echo -n "."; sleep 1
done

cat <<'EOF'

Dependencias listas (los embeddings TEI pueden tardar en descargar el modelo la primera vez):
  Postgres       -> localhost:5432   (dps_wiki / dps_wiki / dps_wiki)
  RabbitMQ       -> localhost:5672   (admin UI: http://localhost:15672, dps_wiki / dps_wiki)
  Embeddings TEI -> http://localhost:8080
  web-extractor  -> http://localhost:3000

Arranca el backend (perfil local):
  ./dev-backend.sh
  (o: cd backend && mvn spring-boot:run -Dspring-boot.run.profiles=local)

  Backend -> http://localhost:8090/api  (health: /actuator/health · login: admin / admin)
EOF
