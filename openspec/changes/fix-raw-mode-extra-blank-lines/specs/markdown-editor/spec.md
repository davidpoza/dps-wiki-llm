## ADDED Requirements

### Requirement: Fidelidad de serialización del markdown

Al serializar el cuerpo editado de vuelta a markdown (para el modo raw y para guardar), el editor SHALL preservar la estructura del markdown original salvo por los cambios reales de edición. En concreto, la serialización SHALL preservar las listas "tight": NO SHALL introducir una línea en blanco entre ítems de lista consecutivos cuando el ítem contiene un único bloque de párrafo. Las listas intencionadamente "loose" (ítems con varios bloques/párrafos) SHALL conservar su separación. La normalización SHALL NO alterar el contenido dentro de bloques de código (fenced/indented). Los bullets SHALL usar el marcador `-` (convención del vault), no `*`.

#### Scenario: Lista "tight" preservada en round-trip

- **WHEN** se carga una nota cuyo cuerpo contiene una lista con ítems de una sola línea sin líneas en blanco entre ellos, y se serializa de nuevo sin editarla
- **THEN** el markdown resultante mantiene la lista sin líneas en blanco entre ítems (idéntico al original)

#### Scenario: Lista "loose" conservada

- **WHEN** una lista del original tiene ítems separados por líneas en blanco (varios párrafos por ítem)
- **THEN** la serialización conserva las líneas en blanco entre esos ítems

#### Scenario: El modo raw muestra markdown fiel

- **WHEN** el usuario abre una nota con listas "tight" y activa el modo raw sin editar
- **THEN** el `<textarea>` muestra las listas sin líneas en blanco espurias entre ítems, y el contenido coincide con lo que se enviaría al backend al guardar

#### Scenario: Contenido de bloques de código intacto

- **WHEN** el cuerpo contiene un bloque de código que incluye líneas que parecen ítems de lista o líneas en blanco
- **THEN** la normalización no modifica el contenido del bloque de código

#### Scenario: Marcador de bullet `-` preservado

- **WHEN** el usuario abre una nota cuyos bullets usan el marcador `-` y activa el modo raw sin editar
- **THEN** los bullets siguen usando `-` (no se reescriben a `*`)

## MODIFIED Requirements

### Requirement: Guardar cambios del fichero

El backend SHALL exponer `PUT /api/files/content?path=<relative-path>` que acepte el contenido actualizado del fichero y lo persista en disco. El frontend SHALL reconstruir el fichero completo (frontmatter original + cuerpo editado) antes de enviarlo al backend. La reconstrucción SHALL **preservar el separador original** entre el bloque de cierre del frontmatter (`---`) y el cuerpo tal como estaba en el fichero cargado: si el original no tenía línea en blanco tras el frontmatter, la reconstrucción tampoco la SHALL introducir; si la tenía, la SHALL conservar. La reconstrucción SHALL NO añadir una línea en blanco espuria.

#### Scenario: Guardado exitoso via botón — fichero con frontmatter

- **WHEN** el usuario hace clic en el botón "Guardar" (o pulsa Ctrl+S) en un fichero que tenía frontmatter
- **THEN** el frontend SHALL reconstruir el contenido completo como `---\n<yaml>\n---<separador original><cuerpo editado>`, usando el mismo separador (línea en blanco o no) que tenía el fichero cargado
- **THEN** el frontend envía `PUT /api/files/content?path=...` con el contenido reconstruido
- **THEN** el backend sobrescribe el fichero y responde HTTP 200
- **THEN** el frontend muestra una notificación de éxito (toast PrimeNG)

#### Scenario: Round-trip del frontmatter idempotente

- **WHEN** el usuario abre un fichero (con o sin línea en blanco tras el frontmatter) y lo guarda sin editar el cuerpo
- **THEN** la separación entre el frontmatter y el cuerpo coincide con la del fichero original (no se añade ni se elimina la línea en blanco)

#### Scenario: YAML del frontmatter preservado verbatim

- **WHEN** el usuario abre un fichero cuyo frontmatter usa comillas u orden de claves concretos y lo guarda sin editar el frontmatter
- **THEN** el bloque YAML reconstruido es idéntico al original (comillas, orden y formato intactos); no se re-serializa desde el objeto parseado

#### Scenario: Frontmatter re-serializado solo al editarlo

- **WHEN** el usuario edita el YAML en el panel de frontmatter
- **THEN** se persiste el texto exacto que el usuario escribió (no una versión re-volcada del objeto)

#### Scenario: Guardado exitoso via botón — fichero sin frontmatter

- **WHEN** el usuario hace clic en el botón "Guardar" (o pulsa Ctrl+S) en un fichero sin frontmatter
- **THEN** el frontend envía el cuerpo editado directamente, sin bloque `---`
- **THEN** el backend sobrescribe el fichero y responde HTTP 200
- **THEN** el frontend muestra una notificación de éxito (toast PrimeNG)

#### Scenario: Error al guardar

- **WHEN** el backend no puede escribir el fichero (permisos, disco lleno)
- **THEN** el backend responde HTTP 500
- **THEN** el frontend muestra un toast de error con el mensaje

#### Scenario: Path fuera del vault al guardar

- **WHEN** el frontend envía un path que resuelve fuera del vault
- **THEN** el backend responde HTTP 400 Bad Request y no escribe ningún fichero
