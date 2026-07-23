## Context

`JobsViewerComponent` renderiza tarjetas con texto potencialmente largo: IDs de job (UUID), rutas de archivo, mensajes de fase, títulos de concepto y etiquetas de actividad. Los contenedores flex no tienen restricciones de ancho mínimo, por lo que los items pueden expandirse más allá del viewport en móvil, causando scroll horizontal.

La causa raíz es el comportamiento por defecto de flexbox: `flex-shrink` no puede reducir un item por debajo de su `min-content` width. Sin `min-width: 0` en los contenedores flex y `overflow: hidden` en los textos, los strings largos expanden el layout.

## Goals / Non-Goals

**Goals:**
- Eliminar el scroll horizontal en móvil en la vista de jobs
- Truncar con ellipsis todos los textos que puedan ser arbitrariamente largos
- Arreglo puramente en CSS, sin tocar lógica ni template

**Non-Goals:**
- Tooltips o popovers con el texto completo (no requerido)
- Cambios en desktop
- Refactorizar el componente o mover estilos a un fichero externo

## Decisions

**`min-width: 0` en contenedores flex con texto largo**
Los elementos flex tienen `min-width: auto` por defecto, lo que impide la reducción. Añadir `min-width: 0` permite que el item se comprima y que `overflow: hidden` surta efecto.

Afecta a: `.file-entry`, `.scan-activity`, `.phase`, `.concept-proposal-entry`.

**`overflow: hidden; text-overflow: ellipsis; white-space: nowrap` en texto inline**
Aplicado a: `.job-id`, `.phase-msg`, `.concept-title`, `.scan-label`.

`.path-btn` ya tiene estas propiedades pero le falta `max-width: 100%` para quedar constreñido por el padre flex cuando ese padre también tiene `min-width: 0`.

## Risks / Trade-offs

- [Texto truncado no visible en su totalidad] → el usuario puede pulsar el botón de ruta para navegar al fichero; el contenido completo sigue siendo accesible
- [Regresión en desktop] → los mismos estilos aplican en desktop pero al haber más ancho el ellipsis raramente se activa; sin impacto visual esperado
