## Why

Los usuarios necesitan una interfaz para navegar por los ficheros del wiki y editar o visualizar su contenido Markdown directamente desde la aplicación, sin depender de herramientas externas. Actualmente no existe ninguna vista de exploración de ficheros ni edición de contenido en el frontend.

## What Changes

- Nueva vista de exploración de ficheros con árbol interactivo (`p-tree` de PrimeNG) que muestra la jerarquía de documentos del wiki.
- Nuevo editor/visor de Markdown embebido (Milkdown) que se abre al seleccionar un fichero en el árbol.
- Nuevo endpoint en el backend Spring Boot para listar la estructura de ficheros y leer/escribir el contenido de un fichero Markdown.
- Integración en el enrutado Angular existente como nueva ruta `/explorer`.

## Capabilities

### New Capabilities

- `file-browser`: Árbol de navegación de ficheros del wiki usando `p-tree` de PrimeNG, cargado desde el backend.
- `markdown-editor`: Editor Markdown enriquecido con Milkdown para visualizar y editar el contenido de los ficheros seleccionados en el árbol.

### Modified Capabilities

<!-- No hay cambios en specs existentes -->

## Impact

- **Frontend**: Nueva librería `@milkdown/core` y plugins asociados. Nuevo componente `ExplorerComponent` con rutas Angular. Nuevo servicio `FileService` para comunicación con el backend.
- **Backend**: Nuevo controlador `FileController` con endpoints REST para listar árbol de ficheros y CRUD de contenido Markdown. Acceso al sistema de ficheros del servidor donde residen los documentos del wiki.
- **Routing**: Nueva ruta `/explorer` añadida al módulo de rutas Angular.
- **Dependencias**: `@milkdown/core`, `@milkdown/preset-commonmark`, `@milkdown/theme-nord` (u otro tema), y posiblemente adaptadores Angular.
