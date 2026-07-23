# markdown-image-input Specification

## Purpose
TBD - created by archiving change markdown-image-syntax-editor. Update Purpose after archive.
## Requirements
### Requirement: Insertar imagen mediante sintaxis markdown
El editor SHALL convertir la secuencia de texto `![alt](url)` o `![alt](url "title")` en un nodo imagen de Milkdown cuando el usuario escriba el `)` de cierre.

#### Scenario: Imagen sin título
- **WHEN** el usuario escribe `![logo](/assets/logo.png)` y presiona el `)` final
- **THEN** el texto raw desaparece y se inserta un nodo imagen con `src=/assets/logo.png` y `alt=logo`

#### Scenario: Imagen con título
- **WHEN** el usuario escribe `![montaña](/assets/img.jpg "Sierra Nevada")` y presiona el `)` final
- **THEN** se inserta un nodo imagen con `src=/assets/img.jpg`, `alt=montaña` y `title=Sierra Nevada`

#### Scenario: Imagen con alt vacío
- **WHEN** el usuario escribe `![](/assets/icon.png)` y presiona el `)` final
- **THEN** se inserta un nodo imagen con `src=/assets/icon.png` y `alt` vacío

#### Scenario: Texto que no es sintaxis imagen
- **WHEN** el usuario escribe cualquier texto terminado en `)` que no siga el patrón `![...](...)` 
- **THEN** el plugin no interfiere y el carácter `)` se inserta normalmente

#### Scenario: URL absoluta
- **WHEN** el usuario escribe `![foto](https://example.com/foto.jpg)` y presiona `)`
- **THEN** se inserta un nodo imagen con `src=https://example.com/foto.jpg`

