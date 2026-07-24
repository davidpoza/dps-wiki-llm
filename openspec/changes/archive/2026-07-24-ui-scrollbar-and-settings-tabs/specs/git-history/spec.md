## MODIFIED Requirements

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

## REMOVED Requirements

### Requirement: Botón de refresco manual
**Reason**: El historial se actualiza automáticamente vía SSE (jobs store). El botón manual es redundante y añade ruido visual.
**Migration**: No se requiere migración; los datos se recargan automáticamente tras operaciones relevantes.
