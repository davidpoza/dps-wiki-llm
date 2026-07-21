## Context

El componente `git-history.component.ts` muestra el historial de cambios en una lista de tarjetas. Cada tarjeta tiene una fila horizontal (`entry-row`) con: insignia de fuente, path del fichero, estadísticas de líneas, fecha y botón de diff. En mobile el path está truncado con ellipsis y el layout se quiebra.

El componente ya incluye `openFile(path)` que navega a `/explorer/<path>`, pero el enlace no es visualmente obvio (no tiene icono de editor, solo es el texto monospace del path clicable).

## Goals / Non-Goals

**Goals:**
- Layout de dos líneas en mobile: path completo en línea 1, metadatos + acciones en línea 2
- Path completo visible sin truncado
- Enlace explícito al editor con icono (`pi pi-external-link` o similar)
- Mantener el comportamiento en desktop igual (o mejorado con el mismo layout de dos líneas)

**Non-Goals:**
- Cambios en backend o API
- Virtualización / infinite scroll
- Cambios en el diff viewer
- Internacionalización de nuevos textos (no se añaden strings de UI)

## Decisions

### D1: Layout de dos líneas universal (no solo en mobile)

El layout de dos líneas es más legible que el layout de una sola línea tanto en mobile como en desktop para paths largos. Se aplica siempre, eliminando el `flex-wrap` implícito que causaba el layout roto.

- **Línea 1 (path-row)**: icono de enlace al editor + path completo del fichero
- **Línea 2 (meta-row)**: insignia de fuente | +N líneas | -N líneas | fecha | botón diff

Alternativa descartada: media query solo para mobile. Más complejo de mantener y el layout de dos líneas también es más limpio en desktop.

### D2: Enlace al editor como elemento separado del path

Se añade un pequeño botón/icono (`<button>` con `pi pi-file-edit` o `pi pi-arrow-right`) antes del path en línea 1. El path sigue siendo clicable también (accesibilidad, comportamiento existente). El icono hace el intent más obvio en mobile donde no hay hover.

Alternativa descartada: cambiar el path a `<a [routerLink]>` puro. Funciona igual pero el botón icono da más área de toque en mobile.

### D3: Sin truncado del path

Se elimina `white-space: nowrap; overflow: hidden; text-overflow: ellipsis` del `.file-path`. En su lugar: `word-break: break-all` para que paths largos rompan en cualquier carácter. El path ocupa línea 1 completa.

## Risks / Trade-offs

- **[Riesgo] Paths muy largos ocupan más espacio vertical** → Asumible: la información completa vale más que la densidad. El componente ya tiene scroll en la lista.
- **[Riesgo] Layout cambiado puede sorprender a usuarios desktop** → Mitigado: el nuevo layout de dos líneas es más legible en todos los tamaños.

## Migration Plan

Cambio puramente de presentación en un único componente. No requiere migración de datos ni rollback especial — revertir el commit es suficiente.
