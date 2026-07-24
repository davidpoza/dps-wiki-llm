## Why

Hay tres problemas de UX en el frontend: la barra de scroll aparece en mitad de la pantalla en varias vistas porque el contenedor scrollable tiene ancho restringido en lugar de ocupar el ancho completo de la ventana; el botón "Actualizar" en la pantalla de cambios (git history) es redundante; y la pantalla de Settings mezcla configuración de prompts con operaciones de datos en una lista plana sin estructura.

## What Changes

- **Fix scrollbar**: En `home.component.scss`, el contenedor `.workspace` tiene `overflow-y: auto` y `width: min(1100px, ...)`, lo que hace que la scrollbar aparezca a 1100px del borde izquierdo en lugar de en el borde de la ventana. La solución es mover la restricción de ancho a `.tab-content` y dejar `.workspace` a ancho completo.
- **Remove refresh button**: Eliminar el botón `Actualizar` / `refresh-btn` de `git-history.component.ts`. Los datos ya se actualizan automáticamente vía el jobs store en tiempo real.
- **Settings tabs**: Reorganizar la pantalla de Settings en dos tabs usando `p-tabs` de PrimeNG:
  - Tab **Prompts**: contiene la sección "Prompts del LLM"
  - Tab **Datos**: contiene Apariencia, Índice del Vault, Keywords, Health Check, Recursos, Mantenimiento, Broken Links y Versión

## Capabilities

### New Capabilities
- `settings-tabs-layout`: Pantalla Settings reorganizada en dos tabs (Prompts / Datos) para separar configuración de LLM de operaciones de mantenimiento del vault

### Modified Capabilities
- `git-history`: Se elimina el botón de refresco manual; la vista se actualiza automáticamente

## Impact

- `frontend/src/app/components/home.component.scss` — mover ancho/centrado de `.workspace` a `.tab-content`
- `frontend/src/app/components/git-history.component.ts` — eliminar botón `refresh-btn` y su CSS
- `frontend/src/app/components/settings.component.ts` — añadir `TabsModule`/`TabPanel` de PrimeNG, reorganizar secciones en dos tabs
- Sin cambios en backend ni API
