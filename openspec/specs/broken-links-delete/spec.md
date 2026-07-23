# broken-links-delete Specification

## Purpose
TBD - created by archiving change broken-links-finder. Update Purpose after archive.
## Requirements
### Requirement: Eliminación de enlaces rotos seleccionados
El sistema SHALL exponer un endpoint `DELETE /api/settings/broken-links` que acepte un body JSON `{ entries: [{sourceFile: string, link: string}] }` y elimine las entradas correspondientes de la sección `## Related` de cada fichero afectado. El endpoint SHALL ser idempotente: si una entrada ya no existe en el fichero en el momento de la eliminación, SHALL ignorarla sin error.

#### Scenario: Eliminación exitosa de varios enlaces
- **WHEN** el usuario confirma la eliminación de una lista de broken links seleccionados
- **THEN** el backend elimina las líneas `- [[slug...]]` correspondientes de la sección Related de cada fichero y devuelve `{ deleted: number }` con el total de entradas efectivamente borradas

#### Scenario: Entrada ya no existe en el fichero
- **WHEN** un enlace a eliminar ya no está presente en la sección Related del fichero
- **THEN** el backend lo ignora silenciosamente y continúa con las demás entradas

#### Scenario: Fichero no encontrado
- **WHEN** el `sourceFile` de una entrada no existe en el vault
- **THEN** el backend lo ignora silenciosamente y devuelve el conteo real de entradas borradas

#### Scenario: Lista vacía
- **WHEN** el body contiene `{ entries: [] }`
- **THEN** el backend devuelve `{ deleted: 0 }` sin modificar ningún fichero

### Requirement: Modal de confirmación con checkboxes
El frontend SHALL mostrar un modal con la lista de broken links agrupados por fichero origen, cada uno con un checkbox seleccionado por defecto. El modal SHALL incluir un botón "Eliminar seleccionados" (deshabilitado si no hay ninguno marcado) y un botón "Cancelar".

#### Scenario: Modal muestra broken links agrupados
- **WHEN** el modal se abre con una lista de broken links
- **THEN** los broken links se muestran agrupados por `sourceFile`, mostrando la ruta del fichero como encabezado de grupo y el `displayAlias` (o `link` si no hay alias) como texto del checkbox

#### Scenario: Todos los checkboxes marcados por defecto
- **WHEN** el modal se abre
- **THEN** todos los checkboxes están marcados por defecto

#### Scenario: Confirmación de eliminación
- **WHEN** el usuario hace clic en "Eliminar seleccionados" con al menos un checkbox marcado
- **THEN** se muestra un diálogo de confirmación con el número de enlaces a eliminar antes de llamar al backend

#### Scenario: Cancelar no modifica nada
- **WHEN** el usuario hace clic en "Cancelar" o cierra el modal
- **THEN** no se realiza ninguna llamada al backend y el modal se cierra

#### Scenario: Botón deshabilitado sin selección
- **WHEN** el usuario desmarca todos los checkboxes
- **THEN** el botón "Eliminar seleccionados" SHALL estar deshabilitado

#### Scenario: Cierre del modal tras eliminación exitosa
- **WHEN** la llamada DELETE al backend completa con éxito
- **THEN** el modal se cierra y se muestra un mensaje de éxito inline con el número de enlaces eliminados

