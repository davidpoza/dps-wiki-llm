# backend-version-footer Specification

## Purpose
TBD - created by syncing change fix-backend-version-display.
## Requirements
### Requirement: Versión del backend visible en el footer de Settings
El footer de la pantalla Settings SHALL mostrar la versión real del backend obtenida del endpoint `/actuator/info`, tanto en desarrollo como en producción.

#### Scenario: Versión disponible
- **WHEN** el usuario abre la pantalla Settings
- **THEN** el footer muestra "Backend: v<versión>" con el valor real del backend (ej. "v0.1.0-SNAPSHOT")

#### Scenario: Error al obtener la versión
- **WHEN** el endpoint `/actuator/info` no es accesible
- **THEN** el footer muestra "Backend: vN/D" como fallback
