#!/usr/bin/env bash
# Arranca el FRONTEND Angular en modo desarrollo (http://localhost:4200).
#
# El proxy de desarrollo (frontend/proxy.conf.json) reenvía /api al backend en
# :8090, así que no hay nada que configurar. Puede arrancarse antes o después
# que el backend (las llamadas a la API fallarán hasta que el backend esté up).
set -euo pipefail
cd "$(dirname "$0")/frontend"

if [ ! -d node_modules ]; then
  echo "Instalando dependencias (pnpm install)..."
  pnpm install
fi

exec pnpm start
