#!/usr/bin/env bash
# Arranca el BACKEND en modo desarrollo con configuración predefinida:
#   1) Levanta las dependencias (vía ./dev-up.sh) compartiendo la red del
#      workspace, para que el backend las vea en localhost.
#   2) Ejecuta Spring Boot con el perfil "local".
#
# No hay nada que configurar: ./dev-backend.sh y a desarrollar.
set -euo pipefail
cd "$(dirname "$0")"

./dev-up.sh

echo
echo "Arrancando el backend (perfil local) -> http://localhost:8090/api"
echo

cd backend
exec mvn spring-boot:run -Dspring-boot.run.profiles=local
