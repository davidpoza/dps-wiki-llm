#!/usr/bin/env bash
# Para las dependencias de desarrollo local (compose.local.yaml).
# Con -v borra también los datos de Postgres:  ./dev-down.sh -v
set -euo pipefail
cd "$(dirname "$0")"
export DEV_NETNS_CONTAINER="$(hostname)"
docker compose -f compose.local.yaml down "$@"
