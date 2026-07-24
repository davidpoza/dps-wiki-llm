## Why

El sidebar del explorer solo muestra el árbol de ficheros y no ofrece ninguna forma de navegar por la estructura interna del documento abierto. Documentos largos obligan a hacer scroll manual para moverse entre secciones. Añadir una tabla de contenido (TOC) en el sidebar permite navegar directamente a cualquier encabezado con un click.

## What Changes

- El `sidebar-toolbar` (columna de iconos de 40px) reemplaza el botón chevron por dos iconos con comportamiento toggle:
  - **Icono archivos** (`pi-folder-open` / `pi-folder`): muestra el árbol de ficheros (`p-tree`) en el panel lateral; si ya está activo, colapsa el panel.
  - **Icono TOC** (`pi-list`): muestra la tabla de contenido del fichero abierto en el mismo espacio; si ya está activo, colapsa el panel.
- El panel lateral (`file-tree-panel`) muestra condicionalmente el `p-tree` o el componente de TOC según el modo activo.
- La TOC lista los encabezados H1–H6 del documento actual con indentación proporcional al nivel; cada entrada hace scroll hasta el encabezado correspondiente en el editor.
- El estado del sidebar se modela con un nuevo signal `sidebarPanel: 'collapsed' | 'files' | 'toc'`.

## Capabilities

### New Capabilities

- `explorer-toc`: Panel lateral de tabla de contenido en el explorer con navegación por encabezados

### Modified Capabilities

_(ninguna — el comportamiento del árbol de ficheros y del resizer no cambia)_

## Impact

- `frontend/src/app/components/explorer.component.ts` — nuevo signal `sidebarPanel`, extracción de headings del markdown, método `scrollToHeading()`, actualización del template (toolbar + panel lateral) y CSS (estilos TOC)
- Sin cambios en backend, API ni otros componentes
