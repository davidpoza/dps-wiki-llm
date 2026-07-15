## MODIFIED Requirements

### Requirement: Renderizar y editar Markdown con Milkdown
El frontend SHALL integrar Milkdown como editor WYSIWYG Markdown. Cuando un fichero esté seleccionado en el árbol, su contenido SHALL cargarse en el editor **excluyendo el bloque frontmatter YAML**, que se mostrará por separado en el panel de metadatos.

#### Scenario: Carga de contenido en el editor
- **WHEN** el usuario selecciona un fichero `.md` en el árbol
- **THEN** el editor Milkdown muestra únicamente el cuerpo del documento renderizado (sin el bloque `---` de frontmatter) listo para editar

#### Scenario: Editor vacío sin selección
- **WHEN** ningún fichero está seleccionado
- **THEN** el editor muestra un placeholder "Selecciona un fichero para editarlo"

#### Scenario: Edición de texto
- **WHEN** el usuario modifica el contenido en el editor
- **THEN** los cambios se reflejan en tiempo real en el panel WYSIWYG (sin guardado automático)

---

### Requirement: Guardar cambios del fichero preservando frontmatter
El backend SHALL exponer `PUT /api/files/content?path=<relative-path>` que acepte el contenido actualizado del fichero y lo persista en disco. El frontend SHALL reconstruir el fichero completo (frontmatter original + cuerpo editado) antes de enviarlo al backend.

#### Scenario: Guardado exitoso via botón — fichero con frontmatter
- **WHEN** el usuario hace clic en el botón "Guardar" (o pulsa Ctrl+S) en un fichero que tenía frontmatter
- **THEN** el frontend SHALL reconstruir el contenido completo como `---\n<yaml>\n---\n\n<cuerpo editado>`
- **THEN** el frontend envía `PUT /api/files/content?path=...` con el contenido reconstruido
- **THEN** el backend sobrescribe el fichero y responde HTTP 200
- **THEN** el frontend muestra una notificación de éxito (toast PrimeNG)

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
