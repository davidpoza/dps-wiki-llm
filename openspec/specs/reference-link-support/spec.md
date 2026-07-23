# reference-link-support Specification

## Purpose
TBD - created by archiving change markdown-live-preview-full-support. Update Purpose after archive.
## Requirements
### Requirement: Crear link de tipo referencia al completar la sintaxis
Cuando el usuario escriba `[texto][ref]` y exista en el documento una definición de referencia `[ref]: url`, el editor SHALL convertir la sintaxis al mark `link` con la URL correspondiente, igual que ocurre con los inline links.

#### Scenario: Reference link con definición existente en el mismo documento
- **WHEN** el usuario escribe `[texto][ref]` y en el documento existe `[ref]: https://ejemplo.com`
- **THEN** al pulsar el último `]`, la sintaxis se convierte en un mark `link` con `href = "https://ejemplo.com"` y texto visible `texto`

#### Scenario: Reference link sin definición en el documento
- **WHEN** el usuario escribe `[texto][ref]` pero no hay definición `[ref]:` en el documento
- **THEN** el texto se deja como texto plano sin convertir (no se pierde información)

#### Scenario: Reference link con definición con title
- **WHEN** existe la definición `[ref]: https://ejemplo.com "Título"` y el usuario escribe `[texto][ref]`
- **THEN** al convertirse, el mark link incluye `href = "https://ejemplo.com"` y `title = "Título"`

### Requirement: Expandir link de referencia al recibir cursor (live preview)
El mark `link` creado a partir de un reference link SHALL comportarse de forma idéntica al link inline en el live preview: al entrar el cursor, SHALL mostrar la sintaxis raw `[texto](url)` editable; al salir, SHALL restaurar el mark link.

#### Scenario: Cursor entra en link proveniente de referencia
- **WHEN** el cursor entra en un mark link que fue creado desde una referencia
- **THEN** el editor muestra `[texto](url)` editable (formato inline, independientemente del origen)

#### Scenario: Cursor sale de link de referencia modificado
- **WHEN** el usuario edita la URL en `[texto](url)` y mueve el cursor fuera
- **THEN** el mark link se actualiza con la nueva URL en formato inline

### Requirement: Autolink reconocido al escribir
Cuando el usuario escriba una URL o email entre `<` y `>` (sintaxis autolink CommonMark), el editor SHALL convertirlo al mark `link` con href igual a la URL al cerrar con `>`.

#### Scenario: Autolink URL al escribir
- **WHEN** el usuario escribe `<https://ejemplo.com>`
- **THEN** al pulsar el último `>`, se crea un mark `link` con `href = "https://ejemplo.com"` y texto visible `https://ejemplo.com`

#### Scenario: Autolink email al escribir
- **WHEN** el usuario escribe `<usuario@ejemplo.com>`
- **THEN** al pulsar el último `>`, se crea un mark `link` con `href = "mailto:usuario@ejemplo.com"` y texto visible `usuario@ejemplo.com`

