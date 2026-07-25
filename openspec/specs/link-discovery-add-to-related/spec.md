# link-discovery-add-to-related Specification

## Purpose
TBD - created by archiving change broken-links-modal-select. Update Purpose after archive.
## Requirements
### Requirement: Selección de enlaces en el modal de discovery

El modal de descubrimiento de enlaces SHALL mostrar un checkbox junto a cada resultado descubierto, permitiendo seleccionar múltiples enlaces.

#### Scenario: Resultados muestran checkboxes

- **WHEN** el modal de link discovery muestra resultados
- **THEN** cada ítem de resultado muestra un checkbox desmarcado por defecto

#### Scenario: Checkbox marca y desmarca

- **WHEN** el usuario hace clic en el checkbox de un resultado
- **THEN** el ítem queda marcado; al volver a hacer clic queda desmarcado

#### Scenario: Seleccionar todos

- **WHEN** el usuario hace clic en "Marcar todos"
- **THEN** todos los ítems de resultado quedan seleccionados

#### Scenario: Deseleccionar todos

- **WHEN** todos los ítems están seleccionados y el usuario hace clic en "Desmarcar todos"
- **THEN** todos los ítems quedan deseleccionados

### Requirement: Botón Añadir a Related en el modal

El footer del modal de link discovery SHALL incluir un botón "Añadir a Related" que permanece deshabilitado cuando no hay ningún enlace seleccionado.

#### Scenario: Botón deshabilitado sin selección

- **WHEN** ningún resultado está seleccionado
- **THEN** el botón "Añadir a Related" está deshabilitado

#### Scenario: Botón habilitado con selección

- **WHEN** al menos un resultado está seleccionado
- **THEN** el botón "Añadir a Related" está habilitado

### Requirement: Inserción de enlaces seleccionados en sección Related

Al confirmar, el sistema SHALL añadir los enlaces seleccionados como wikilinks (`- [[slug]]`) en la sección `## Related` del documento abierto en el editor, sin duplicados, y guardar el fichero.

#### Scenario: Inserción en sección Related existente

- **WHEN** el usuario hace clic en "Añadir a Related" con N enlaces seleccionados
- **AND** el documento tiene una sección `## Related`
- **THEN** los N enlaces se añaden como líneas `- [[slug]]` al final del bloque Related
- **AND** el fichero se guarda automáticamente
- **AND** el modal se cierra

#### Scenario: Sección Related ausente

- **WHEN** el usuario hace clic en "Añadir a Related"
- **AND** el documento no tiene sección `## Related`
- **THEN** se crea la sección `## Related` antes de `## Sources` si existe, o al final del documento si no existe
- **AND** los enlaces seleccionados se añaden bajo la nueva sección

#### Scenario: Evitar duplicados al insertar en Related

- **WHEN** un enlace seleccionado ya existe en la sección `## Related`
- **THEN** ese enlace no se añade de nuevo

#### Scenario: Modal no muestra enlaces ya presentes en la nota

- **WHEN** el modal de Link Discovery muestra resultados
- **THEN** no aparece ningún resultado cuyo slug ya esté presente como wikilink en cualquier parte del contenido de la nota

#### Scenario: Reset de selección al abrir modal

- **WHEN** el usuario abre el modal de link discovery
- **THEN** todos los checkboxes aparecen desmarcados

