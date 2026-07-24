## 1. Corrección del path en ApiService

- [x] 1.1 En `frontend/proxy.conf.json`, añadir entrada para `/actuator` con `target: http://localhost:8090`, `secure: false`, `changeOrigin: true` _(revertido — causa raíz era distinta)_
- [x] 1.2 En `frontend/src/app/services/api.service.ts`, cambiar `getActuatorInfo()` para llamar a `/api/actuator/info` en lugar de `/actuator/info` (el backend tiene context-path `/api`)

## 2. Verificación

- [x] 2.1 Abrir la pantalla Settings y verificar que el footer muestra "Backend: v0.1.0-SNAPSHOT" (o la versión actual) en lugar de "N/D"
