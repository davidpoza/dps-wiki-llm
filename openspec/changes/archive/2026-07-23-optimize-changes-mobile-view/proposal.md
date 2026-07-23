## Why

La vista de cambios (`git-history.component.ts`) muestra cada entrada en una sola fila horizontal (`flex-wrap: wrap`) que en pantallas móviles resulta en un layout roto: el nombre de fichero queda truncado con ellipsis y los elementos se reorganizan de forma caótica. El usuario no puede ver el path completo ni tiene una ruta clara para abrir el fichero en el editor desde esta pantalla.

## What Changes

- Rediseñar las `entry-card` con un layout de **dos líneas**: línea 1 con el path completo del fichero (como enlace al editor), línea 2 con la insignia de fuente, estadísticas (+/-), fecha y botón de diff.
- Eliminar el truncado (`text-overflow: ellipsis; white-space: nowrap`) del `file-path` para mostrar el nombre completo.
- Convertir el path del fichero en un enlace explícito (con icono) que abra el fichero en el editor (`/explorer/...`), manteniéndolo visualmente claro como elemento interactivo.
- Añadir media queries para que el layout de dos líneas se active en mobile (`≤ 600px`) manteniendo el diseño actual en desktop si sigue funcionando.

## Capabilities

### New Capabilities
- `changes-mobile-card`: Layout de tarjeta de dos líneas para las entradas de cambios, optimizado para pantallas móviles con path completo y enlace al editor.

### Modified Capabilities
- (ninguna — los cambios son puramente de presentación/CSS/template, sin cambios en lógica de negocio ni API)

## Impact

- `frontend/src/app/components/git-history.component.ts`: template y styles del componente.
- Sin cambios en backend, routing, traducciones ni tipos.
