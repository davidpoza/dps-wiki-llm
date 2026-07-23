## 1. Backend: publicar versión en actuator info

- [x] 1.1 Añadir el goal `build-info` en la sección `<executions>` del `spring-boot-maven-plugin` en `backend/pom.xml`
- [x] 1.2 Añadir `/actuator/info` a la lista `permitAll` en `SecurityConfig.java`
- [x] 1.3 Verificar que `GET /actuator/info` responde con `{"build": {"version": "..."}}` sin token

## 2. Frontend: constante de versión

- [x] 2.1 Crear `frontend/src/app/version.ts` exportando `export const APP_VERSION = '0.1.0'` (sincronizado con `package.json`)

## 3. Frontend: servicio y componente

- [x] 3.1 Añadir método `getActuatorInfo()` en `api.service.ts` que llame a `GET /actuator/info` y devuelva `Observable<{build?: {version?: string}}>`
- [x] 3.2 Añadir `signal` `backendVersion` en `settings.component.ts` e inyectar `ApiService`
- [x] 3.3 Llamar a `getActuatorInfo()` en `ngOnInit` del `SettingsComponent`, asignando la versión al signal (o `'N/D'` en caso de error)
- [x] 3.4 Añadir un `<footer>` al template de `SettingsComponent` que muestre `Frontend: vX.Y.Z | Backend: vX.Y.Z`
- [x] 3.5 Añadir estilos al footer (color muted, font-size pequeño, alineado a la derecha o centrado en la parte inferior del workspace)
