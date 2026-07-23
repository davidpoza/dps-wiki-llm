## Why

La vista de jobs produce scroll horizontal en móvil cuando los textos (IDs de job, rutas de archivo, mensajes de fase, títulos de concepto) son demasiado largos. Los elementos flex dentro de `.job-card` no tienen restricciones de ancho mínimo, por lo que expanden el contenedor más allá del viewport.

## What Changes

- Añadir `min-width: 0` a los contenedores flex que contienen texto largo (`.file-entry`, `.scan-activity`, `.phase`)
- Añadir `overflow: hidden; text-overflow: ellipsis; white-space: nowrap` al `.job-id`
- Asegurar que `.path-btn` tenga `max-width: 100%` para quedar constreñido por su padre flex
- Añadir truncado con ellipsis a `.phase-msg` y `.concept-title` para evitar desbordamiento

## Capabilities

### New Capabilities
<!-- ninguna -->

### Modified Capabilities
<!-- Solo cambios de CSS en un componente, sin cambios de requisitos de spec -->

## Impact

- `frontend/src/app/components/jobs-viewer.component.ts` — solo estilos CSS inline del componente
- Sin cambios de API, backend ni lógica
