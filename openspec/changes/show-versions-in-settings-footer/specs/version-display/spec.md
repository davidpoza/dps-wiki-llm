## ADDED Requirements

### Requirement: Backend expone versión en actuator info
El backend SHALL publicar la versión del artefacto en el endpoint `/actuator/info` bajo la clave `build.version`, generada automáticamente por el goal `build-info` del `spring-boot-maven-plugin`. El endpoint SHALL ser accesible sin autenticación.

#### Scenario: Endpoint info accesible sin token
- **WHEN** se realiza una petición GET a `/actuator/info` sin cabecera `Authorization`
- **THEN** el servidor responde con HTTP 200 y un cuerpo JSON que incluye `{"build": {"version": "<semver>", ...}}`

#### Scenario: Versión coincide con pom.xml
- **WHEN** se consulta `/actuator/info` tras un build Maven
- **THEN** el valor de `build.version` coincide con el campo `<version>` del `pom.xml`

### Requirement: Settings muestra versión del frontend
La pantalla Settings SHALL incluir un footer que muestre la versión del frontend, extraída de la constante `APP_VERSION` definida en `src/app/version.ts`.

#### Scenario: Footer visible en settings
- **WHEN** el usuario navega a la pantalla Settings
- **THEN** el footer muestra el texto de versión del frontend con el formato `Frontend: vX.Y.Z`

### Requirement: Settings muestra versión del backend
La pantalla Settings SHALL obtener la versión del backend llamando a `/actuator/info` al inicializarse el componente y mostrarla en el mismo footer.

#### Scenario: Versión del backend cargada correctamente
- **WHEN** el componente Settings se inicializa y `/actuator/info` responde con `build.version`
- **THEN** el footer muestra `Backend: vX.Y.Z` junto a la versión del frontend

#### Scenario: Backend no disponible
- **WHEN** el componente Settings se inicializa y `/actuator/info` falla (timeout, error de red, etc.)
- **THEN** el footer muestra `Backend: N/D` sin interrumpir el resto de la pantalla
