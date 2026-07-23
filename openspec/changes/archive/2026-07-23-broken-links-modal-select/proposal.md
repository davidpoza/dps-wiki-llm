## Why

El modal de descubrimiento de enlaces en el editor muestra resultados pero solo permite navegar a cada enlace individualmente al hacer clic. El usuario necesita poder seleccionar múltiples enlaces y añadirlos de una sola vez a la sección `## Related` del documento actual.

## What Changes

- Los ítems de resultado en el modal de link discovery tendrán checkboxes para selección múltiple
- El modal tendrá un botón "Añadir a Related" que se activa cuando hay al menos un enlace seleccionado
- Al confirmar, los enlaces seleccionados se insertan como wikilinks en la sección `## Related` del documento en edición, evitando duplicados
- El documento se guarda automáticamente tras la inserción
- El botón "Cerrar" pasa a ser "Cancelar" cuando hay resultados disponibles para reflejar la nueva funcionalidad

## Capabilities

### New Capabilities

- `link-discovery-add-to-related`: Selección mediante checkboxes en el modal de descubrimiento de enlaces y adición de los seleccionados a la sección Related del documento actual

### Modified Capabilities

## Impact

- `frontend/src/app/components/explorer.component.ts`: modificaciones en el template del modal `linkDiscovery`, nuevos signals para estado de selección, nuevo método para insertar enlaces en la sección Related y guardar
- No se requieren cambios en el backend
