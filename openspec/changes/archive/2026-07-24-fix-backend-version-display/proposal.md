## Why

En la pantalla Settings el footer muestra la versión del backend como "N/D" porque el proxy de desarrollo solo reenvía rutas `/api/**` al backend, pero el servicio Angular llama a `/actuator/info` (sin prefijo `/api`), que en desarrollo llega al servidor Vite en lugar de Spring Boot.

## What Changes

- Añadir la ruta `/actuator` al proxy de desarrollo (`proxy.conf.json`) para que las llamadas a `/actuator/info` se reenvíen al backend Spring Boot en desarrollo.

## Capabilities

### New Capabilities

_(ninguna — es una corrección de configuración, no una nueva capacidad)_

### Modified Capabilities

_(ninguna — el comportamiento del endpoint ya existe y es correcto en producción)_

## Impact

- `frontend/proxy.conf.json` — añadir entrada de proxy para `/actuator`
