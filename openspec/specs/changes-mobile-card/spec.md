# changes-mobile-card Specification

## Purpose
TBD - created by archiving change optimize-changes-mobile-view. Update Purpose after archive.
## Requirements
### Requirement: Two-line card layout for change entries
Cada tarjeta de entrada de cambio SHALL mostrar su contenido en dos líneas: la primera línea con el enlace al editor y el path completo del fichero, la segunda línea con los metadatos y acciones (insignia de fuente, estadísticas +/-, fecha, botón de diff).

#### Scenario: Card displays full file path on first line
- **WHEN** la vista de cambios carga entradas
- **THEN** cada tarjeta muestra el path completo del fichero en la primera línea sin truncado

#### Scenario: Card displays metadata on second line
- **WHEN** la vista de cambios carga entradas
- **THEN** cada tarjeta muestra en la segunda línea: insignia de fuente, líneas añadidas (+N), líneas eliminadas (-N), fecha y botón de diff

### Requirement: Editor link in change entry
Cada tarjeta de cambio SHALL incluir un enlace explícito (icono + path clicable) que abra el fichero en el editor (`/explorer/<path>`).

#### Scenario: Tapping the editor link opens the file in the editor
- **WHEN** el usuario pulsa el icono de enlace al editor o el path del fichero
- **THEN** la aplicación navega a `/explorer/<path>` abriendo el fichero en el editor

#### Scenario: Editor link is visible on mobile without hover
- **WHEN** la vista se renderiza en una pantalla ≤ 600px
- **THEN** el icono de enlace al editor es visible sin necesidad de hover

### Requirement: Full file path visible without truncation
El path del fichero en cada tarjeta SHALL mostrarse completo, sin `text-overflow: ellipsis`, permitiendo que el texto envuelva si es necesario.

#### Scenario: Long file paths wrap instead of truncate
- **WHEN** el path del fichero tiene más caracteres de los que caben en una línea
- **THEN** el path envuelve al siguiente renglón en lugar de quedar cortado con "..."

