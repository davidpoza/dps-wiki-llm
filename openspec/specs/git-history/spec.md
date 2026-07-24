# git-history Specification

## Purpose
TBD - created by archiving change git-history-viewer. Update Purpose after archive.
## Requirements
### Requirement: Listar commits con estadísticas de archivos
El sistema SHALL exponer un endpoint `GET /api/git/log` que devuelva la lista de commits recientes del repositorio vault incluyendo, por cada commit: SHA completo, autor, fecha ISO-8601, mensaje y la lista de archivos modificados con líneas añadidas y eliminadas.

#### Scenario: Obtener historial con commits existentes
- **WHEN** el cliente autenticado realiza `GET /api/git/log?limit=50`
- **THEN** el sistema responde 200 con un array JSON de commits ordenados del más reciente al más antiguo, cada uno con campos `sha`, `author`, `date`, `message` y `files` (array con `path`, `added`, `deleted`)

#### Scenario: Repositorio sin commits
- **WHEN** el cliente realiza `GET /api/git/log` y el vault no tiene commits
- **THEN** el sistema responde 200 con un array vacío `[]`

#### Scenario: Petición sin autenticación
- **WHEN** se realiza `GET /api/git/log` sin token JWT válido
- **THEN** el sistema responde 401

### Requirement: Revertir repositorio a un commit anterior
El sistema SHALL exponer un endpoint `POST /api/git/reset` que ejecute `git reset --hard <sha>` sobre el vault, descartando todos los commits posteriores al SHA indicado.

#### Scenario: Reset exitoso a un commit válido
- **WHEN** el cliente autenticado envía `POST /api/git/reset` con body `{"sha": "<sha-válido>"}`
- **THEN** el sistema ejecuta `git reset --hard <sha>` y responde 200 con el SHA resultante de HEAD

#### Scenario: SHA inválido o inexistente
- **WHEN** el cliente envía `POST /api/git/reset` con un SHA que no existe en el repositorio
- **THEN** el sistema responde 400 con mensaje de error descriptivo

#### Scenario: Petición sin autenticación
- **WHEN** se realiza `POST /api/git/reset` sin token JWT válido
- **THEN** el sistema responde 401

### Requirement: Pantalla de historial git en el frontend
El sistema SHALL mostrar una pantalla de historial git accesible desde la navegación principal, que liste los commits con sus estadísticas y permita revertir a cualquier commit seleccionado. La pantalla SHALL actualizar su contenido automáticamente sin requerir acción manual del usuario.

#### Scenario: Visualización del historial
- **WHEN** el usuario navega a la pantalla de historial git
- **THEN** se muestra la lista de commits con: SHA abreviado (7 chars), autor, fecha relativa o formateada, mensaje, y estadísticas de archivos (número de archivos, líneas + y -)

#### Scenario: Revertir a un commit con confirmación
- **WHEN** el usuario selecciona un commit y pulsa "Revertir a este commit"
- **THEN** se muestra un diálogo de confirmación indicando el SHA y el mensaje del commit, y al confirmar se llama a `POST /api/git/reset` y se recarga el historial

#### Scenario: Error al revertir
- **WHEN** la llamada a `POST /api/git/reset` devuelve un error
- **THEN** se muestra un mensaje de error al usuario sin modificar la vista actual

