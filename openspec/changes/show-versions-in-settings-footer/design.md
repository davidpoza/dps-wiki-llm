## Context

El proyecto tiene backend Spring Boot 3.3.7 con `spring-boot-starter-actuator` ya en las dependencias y los endpoints `health` e `info` expuestos en `management.endpoints.web.exposure.include`. Sin embargo:

- El plugin `spring-boot-maven-plugin` no tiene configurado el goal `build-info`, por lo que `/actuator/info` devuelve `{}`.
- `/actuator/info` no está en la lista `permitAll` de `SecurityConfig`, por lo que requiere JWT.
- El frontend no tiene ficheros `environment.ts` ni ningún mecanismo de versión.

## Goals / Non-Goals

**Goals:**
- Exponer la versión del backend (desde `pom.xml`) en `/actuator/info` sin autenticación.
- Mostrar las versiones de frontend y backend en un footer de la pantalla Settings.

**Non-Goals:**
- No se exponen otros endpoints de actuator públicamente.
- No se implementa un mecanismo de auto-sincronización de versión entre `package.json` y el código TypeScript (se gestiona manualmente).

## Decisions

### 1. Versión del backend vía `build-info`

Añadir el goal `build-info` al `spring-boot-maven-plugin` en `pom.xml`. Esto genera `META-INF/build-info.properties` en el JAR con los campos `build.version`, `build.artifact`, `build.name`, `build.time`. Spring Boot Actuator los expone automáticamente en `/actuator/info` bajo la clave `"build"`.

**Alternativa descartada:** Añadir `info.app.version=@project.version@` en `application.yml`. Requiere que el plugin de Maven filtre resources, que no está configurado. El goal `build-info` es la forma canónica y más completa.

### 2. Acceso público a `/actuator/info`

Añadir `/actuator/info` a la lista `permitAll` en `SecurityConfig`. El endpoint no expone información sensible (solo versión/artefacto/timestamp de build).

**Alternativa descartada:** Requerir autenticación y llamar con el token JWT desde el frontend. Añade complejidad innecesaria para datos no sensibles.

### 3. Versión del frontend

Crear `src/app/version.ts` con una constante `APP_VERSION` que los desarrolladores actualizan junto con `package.json`. Es la opción más simple sin dependencias de build extra.

**Alternativa descartada:** Importar `package.json` directamente con `resolveJsonModule: true`. Requiere modificar `tsconfig.json` e incluye el `package.json` completo en el bundle, lo que expone metadatos innecesarios.

### 4. Llamada al actuator desde el frontend

`ApiService` añade un método `getActuatorInfo()` que llama a `/actuator/info`. El proxy de Angular dev server (`proxy.conf.json`) ya redirige `/actuator/**` al backend si está configurado; en producción el reverse proxy (nginx/Spring) lo gestiona de igual manera que `/api/**`.

El `SettingsComponent` llama a `getActuatorInfo()` en `ngOnInit` y muestra la versión del backend con un estado de carga y un fallback de error discreto.

## Risks / Trade-offs

- **`/actuator/info` público** → Mitigation: el endpoint solo expone datos de build (versión, timestamp). No hay datos de negocio ni credenciales. Spring Boot no expone otros datos por defecto.
- **Versión frontend desincronizada** → Mitigation: es un dato visual; un error de versión no afecta al funcionamiento. Se puede automatizar con un script `prebuild` en el futuro si se convierte en problema.
- **`/actuator/info` no disponible en dev sin backend** → El componente muestra "N/D" en caso de error, sin interrumpir la funcionalidad.

## Migration Plan

1. Modificar `pom.xml` → añadir execution `build-info` al `spring-boot-maven-plugin`.
2. Modificar `SecurityConfig.java` → añadir `/actuator/info` a `permitAll`.
3. Crear `src/app/version.ts` en el frontend.
4. Añadir `getActuatorInfo()` en `ApiService`.
5. Modificar `SettingsComponent` para mostrar el footer.
6. Verificar con `mvn spring-boot:run` que `/actuator/info` devuelve la versión correcta.

Rollback: revertir los cambios es trivial y sin impacto en datos persistidos.
