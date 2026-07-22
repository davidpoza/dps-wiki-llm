## ADDED Requirements

### Requirement: Escaneo SSE de enlaces rotos en la sección Related
El sistema SHALL exponer un endpoint SSE `GET /api/settings/broken-links/scan` que escanee todos los ficheros `*.md` bajo `wiki/concepts`, `wiki/sources` y `wiki/topics`, extraiga los enlaces wiki `[[slug]]` de la sección `## Related` de cada uno, y determine si el slug corresponde a un fichero existente en el vault. El endpoint SHALL emitir un evento `progress` por cada fichero procesado, un evento `result` con la lista completa de broken links al terminar, y finalmente un evento `done`.

#### Scenario: Progreso en tiempo real
- **WHEN** el usuario inicia el escaneo
- **THEN** el frontend recibe un evento SSE `progress` por cada fichero procesado con `{ processed, total, file }`

#### Scenario: Lista de broken links al completar
- **WHEN** el escaneo termina
- **THEN** el frontend recibe un evento SSE `result` con `{ brokenLinks: [{sourceFile, link, displayAlias}] }` que agrupa todos los enlaces rotos encontrados

#### Scenario: Señal de finalización
- **WHEN** el escaneo termina sin error
- **THEN** el frontend recibe un evento SSE `done` que indica que el stream ha concluido

#### Scenario: Error durante el escaneo
- **WHEN** ocurre una excepción durante el escaneo
- **THEN** el frontend recibe un evento SSE `error` con `{ message }` y el stream se cierra

#### Scenario: Vault sin enlaces rotos
- **WHEN** el escaneo termina y no hay enlaces rotos
- **THEN** el evento `result` contiene `{ brokenLinks: [] }` y el modal no muestra entradas

#### Scenario: Slug con alias
- **WHEN** un enlace tiene la forma `[[slug|alias]]`
- **THEN** el sistema SHALL extraer `slug` para la verificación y `alias` como `displayAlias` en el resultado

#### Scenario: Solo sección Related
- **WHEN** un fichero tiene enlaces `[[slug]]` fuera de la sección `## Related` (ej. en Summary o Sources)
- **THEN** el sistema SHALL ignorar esos enlaces y NO los incluirá en el resultado

### Requirement: Resolución de slugs por nombre de fichero
El sistema SHALL considerar un slug como "válido" si existe algún fichero `*.md` en el vault cuyo nombre base (sin extensión) sea igual al slug (comparación case-insensitive). Si no existe ningún fichero con ese nombre, el enlace SHALL considerarse "roto".

#### Scenario: Slug resuelve a fichero existente
- **WHEN** el slug `foo` corresponde al fichero `wiki/concepts/foo.md`
- **THEN** el enlace NO se incluirá en el resultado de broken links

#### Scenario: Slug no resuelve a ningún fichero
- **WHEN** el slug `bar-inexistente` no corresponde a ningún fichero `.md` en el vault
- **THEN** el enlace SHALL incluirse en el resultado con `sourceFile`, `link` y `displayAlias`

#### Scenario: Slug con ruta parcial
- **WHEN** un enlace tiene la forma `[[wiki/concepts/foo|alias]]`
- **THEN** el sistema SHALL comparar el slug completo `wiki/concepts/foo` contra la ruta relativa del fichero (sin extensión) además de contra el nombre base

### Requirement: Sección de Settings para broken links
La pantalla de Settings SHALL mostrar una sección "Enlaces rotos" con un botón "Buscar enlaces rotos" que lanza el escaneo SSE y muestra el progreso en tiempo real mientras está en curso.

#### Scenario: Botón inicia el escaneo
- **WHEN** el usuario hace clic en "Buscar enlaces rotos"
- **THEN** el botón se deshabilita y se muestra el progreso `Ficheros procesados X/Y`

#### Scenario: Modal se abre al completar
- **WHEN** el escaneo termina con broken links encontrados
- **THEN** se abre automáticamente el modal de broken links con la lista de resultados

#### Scenario: Mensaje de éxito sin broken links
- **WHEN** el escaneo termina y no hay broken links
- **THEN** se muestra un mensaje inline "No se encontraron enlaces rotos" sin abrir ningún modal
