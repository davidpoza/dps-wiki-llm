## ADDED Requirements

### Requirement: Enrich links for specified wiki documents
El script `enrich-links.ts` SHALL aceptar uno o más paths de documentos wiki y añadir la sección `Related` con hasta 5 enlaces descubiertos mediante búsqueda FTS/semántica, sin modificar ningún otro contenido del documento.

#### Scenario: Documento sin sección Related
- **WHEN** se ejecuta `enrich-links --vault . --paths wiki/concepts/foo.md` y `foo.md` no tiene sección `Related`
- **THEN** el script añade una sección `## Related` al final del documento con los enlaces encontrados

#### Scenario: Documento con sección Related existente
- **WHEN** se ejecuta sobre un documento que ya tiene sección `Related`
- **THEN** el script fusiona los nuevos enlaces (sin duplicados) usando `upsertSection`, preservando los enlaces existentes

#### Scenario: No se encuentran candidatos
- **WHEN** la búsqueda no devuelve resultados distintos al propio documento
- **THEN** el script termina sin modificar el fichero y sin error

#### Scenario: Documento con docType desconocido
- **WHEN** el documento no está en una carpeta de tipo reconocido y no tiene `type` en frontmatter
- **THEN** el script omite ese documento, registra un warning, y continúa con los demás

### Requirement: Modo de operación CLI
El script SHALL seguir el patrón de herramientas existente: entrada por argumentos de línea de comandos, salida JSON por stdout, logs por stderr.

#### Scenario: Invocación con paths específicos
- **WHEN** se invoca con `--vault <path> --paths <path1> [<path2> ...]`
- **THEN** solo procesa los documentos indicados

#### Scenario: Invocación sin paths (modo bulk)
- **WHEN** se invoca con solo `--vault <path>` sin `--paths`
- **THEN** procesa todos los documentos de tipo conocido en `wiki/`

### Requirement: No destrucción de contenido
El script SHALL usar `renderMarkdown` con un payload que solo contenga `related_links`, garantizando que frontmatter, título y todas las secciones existentes permanecen intactas.

#### Scenario: Contenido preexistente preservado
- **WHEN** el documento tiene contenido libre (sin formato estándar) y se enriquece
- **THEN** todo el contenido original está presente en el fichero resultante, idéntico al original salvo por la adición de `Related`
