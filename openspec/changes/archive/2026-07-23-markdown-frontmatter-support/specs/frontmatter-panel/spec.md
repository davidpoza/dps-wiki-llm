## ADDED Requirements

### Requirement: Mostrar metadatos YAML del fichero en panel de lectura
El frontend SHALL extraer el frontmatter YAML del contenido del fichero Markdown usando `gray-matter` y mostrarlo en un panel colapsable encima del editor cuando el fichero contenga frontmatter.

#### Scenario: Fichero con frontmatter — panel visible
- **WHEN** el usuario selecciona un fichero `.md` que contiene un bloque frontmatter YAML (`---` ... `---`)
- **THEN** el panel de metadatos SHALL mostrarse encima del editor con todos los pares clave-valor del frontmatter

#### Scenario: Fichero sin frontmatter — panel oculto
- **WHEN** el usuario selecciona un fichero `.md` que no contiene bloque frontmatter
- **THEN** el panel de metadatos SHALL permanecer oculto y el editor SHALL ocupar todo el espacio disponible

#### Scenario: Colapsar panel de metadatos
- **WHEN** el panel de metadatos está visible y el usuario hace clic en el botón de colapso
- **THEN** el panel SHALL ocultarse y el editor SHALL expandirse para ocupar el espacio liberado

#### Scenario: Expandir panel de metadatos colapsado
- **WHEN** el panel de metadatos está colapsado y el usuario hace clic en el botón de expansión
- **THEN** el panel SHALL mostrarse de nuevo con los metadatos del fichero actual

---

### Requirement: Metadatos en modo solo lectura
El panel de metadatos SHALL mostrar los valores en modo solo lectura. El usuario no podrá editar los campos del frontmatter desde la UI en esta iteración.

#### Scenario: Intento de edición de un campo
- **WHEN** el usuario intenta hacer clic o modificar un valor del panel de metadatos
- **THEN** el campo SHALL permanecer no editable (solo texto)
