## ADDED Requirements

### Requirement: Renderizar y editar Markdown con Milkdown
El frontend SHALL integrar Milkdown como editor WYSIWYG Markdown. Cuando un fichero esté seleccionado en el árbol, su contenido SHALL cargarse en el editor.

#### Scenario: Carga de contenido en el editor
- **WHEN** el usuario selecciona un fichero `.md` en el árbol
- **THEN** el editor Milkdown muestra el contenido renderizado del fichero listo para editar

#### Scenario: Editor vacío sin selección
- **WHEN** ningún fichero está seleccionado
- **THEN** el editor muestra un placeholder "Selecciona un fichero para editarlo"

#### Scenario: Edición de texto
- **WHEN** el usuario modifica el contenido en el editor
- **THEN** los cambios se reflejan en tiempo real en el panel WYSIWYG (sin guardado automático)

---

### Requirement: Guardar cambios del fichero
El backend SHALL exponer `PUT /api/files/content?path=<relative-path>` que acepte el contenido actualizado del fichero y lo persista en disco.

#### Scenario: Guardado exitoso via botón
- **WHEN** el usuario hace clic en el botón "Guardar" (o pulsa Ctrl+S)
- **THEN** el frontend envía `PUT /api/files/content?path=...` con el contenido actual
- **THEN** el backend sobrescribe el fichero y responde HTTP 200
- **THEN** el frontend muestra una notificación de éxito (toast PrimeNG)

#### Scenario: Error al guardar
- **WHEN** el backend no puede escribir el fichero (permisos, disco lleno)
- **THEN** el backend responde HTTP 500
- **THEN** el frontend muestra un toast de error con el mensaje

#### Scenario: Path fuera del vault al guardar
- **WHEN** el frontend envía un path que resuelve fuera del vault
- **THEN** el backend responde HTTP 400 Bad Request y no escribe ningún fichero

---

### Requirement: Indicador de cambios no guardados
El editor SHALL indicar visualmente cuando hay cambios pendientes de guardar.

#### Scenario: Cambios sin guardar
- **WHEN** el usuario modifica el contenido del fichero
- **THEN** el título del fichero muestra un indicador visual (e.g. asterisco `*`) y el botón "Guardar" se habilita

#### Scenario: Tras guardar exitosamente
- **WHEN** el guardado se completa con éxito
- **THEN** el indicador de cambios desaparece y el botón "Guardar" se deshabilita

#### Scenario: Navegación con cambios sin guardar
- **WHEN** el usuario selecciona otro fichero en el árbol con cambios sin guardar en el editor actual
- **THEN** se muestra un diálogo de confirmación antes de descartar los cambios
