## ADDED Requirements

### Requirement: Toggle entre modo WYSIWYG y modo raw
La toolbar del editor SHALL incluir un botón toggle que alterne entre el editor Milkdown (WYSIWYG) y un `<textarea>` que muestra el contenido completo del fichero en markdown bruto (incluyendo el bloque frontmatter). El modo por defecto SHALL ser WYSIWYG. El modo SHALL resetearse a WYSIWYG al cargar un fichero diferente.

#### Scenario: Activar modo raw con fichero abierto
- **WHEN** el usuario pulsa el botón de modo raw con un fichero abierto en el editor
- **THEN** el editor Milkdown se oculta y aparece un `<textarea>` con el contenido completo del fichero (frontmatter + cuerpo), incluyendo cualquier cambio no guardado pendiente en el editor

#### Scenario: Volver a modo WYSIWYG desde raw
- **WHEN** el usuario pulsa el botón de toggle estando en modo raw
- **THEN** el textarea se oculta, el contenido del textarea se re-parsea (frontmatter + cuerpo) y se carga en el editor Milkdown; el panel de frontmatter refleja el frontmatter actualizado

#### Scenario: Modo reseteado al cambiar de fichero
- **WHEN** el usuario selecciona un fichero diferente en el árbol mientras está en modo raw
- **THEN** el editor se muestra en modo WYSIWYG con el nuevo fichero

#### Scenario: Botón toggle visualmente activo en modo raw
- **WHEN** el editor está en modo raw
- **THEN** el botón de toggle SHALL mostrar un estado visual activo (mismo patrón que otros botones activos de la toolbar)

### Requirement: Edición en modo raw
En modo raw, el `<textarea>` SHALL ser editable. Los cambios en el textarea SHALL activar el indicador de cambios no guardados (`isDirty`).

#### Scenario: Editar contenido en textarea raw
- **WHEN** el usuario modifica el contenido del textarea en modo raw
- **THEN** el indicador de cambios no guardados se activa y el botón "Guardar" se habilita

#### Scenario: Guardar desde modo raw
- **WHEN** el usuario guarda (botón o Ctrl+S) estando en modo raw
- **THEN** el sistema guarda el contenido actual del textarea tal como está, sin transformaciones adicionales

### Requirement: Botones WYSIWYG deshabilitados en modo raw
Los botones de la toolbar que solo aplican al editor Milkdown SHALL estar deshabilitados cuando el editor está en modo raw.

#### Scenario: Botones deshabilitados en modo raw
- **WHEN** el editor está en modo raw
- **THEN** los botones "Insertar tabla" y "Enriquecer" SHALL mostrarse deshabilitados
