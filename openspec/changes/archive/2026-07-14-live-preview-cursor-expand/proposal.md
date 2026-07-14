## Why

El editor Milkdown (WYSIWYG) renderiza todos los elementos markdown — links, imágenes, negrita, cursiva, código inline, encabezados, etc. — como nodos ProseMirror opacos: al posicionar el cursor sobre ellos con las teclas de flecha, el usuario no puede ver ni editar la sintaxis markdown subyacente. Esto impide corregir la URL de un link, el alt de una imagen, o el texto de un elemento formateado sin borrar y reescribir desde cero.

## What Changes

- Nuevo plugin ProseMirror `live-preview.plugin.ts` que implementa expansión inline al estilo "live preview" de Obsidian:
  - Cuando el cursor entra en un nodo o mark formateado, ese elemento se "deshace" mostrando su sintaxis markdown raw como texto editable.
  - Cuando el cursor sale del elemento, vuelve a renderizarse como formato visual.
- Cubre todos los tipos de elementos inline del schema CommonMark de Milkdown: **link**, **image**, **strong** (negrita), **em** (cursiva), **code** (código inline).
- El plugin se registra en el editor junto a los plugins existentes.

## Capabilities

### New Capabilities

- `live-preview-cursor-expand`: Expansión inline de cualquier elemento markdown al posicionar el cursor sobre él; el texto raw es editable y al mover el cursor el elemento se vuelve a renderizar.

### Modified Capabilities

<!-- No hay cambios de requisitos en specs existentes -->

## Impact

- **Archivo nuevo**: `frontend/src/app/components/live-preview.plugin.ts`
- **Modificado**: `frontend/src/app/components/explorer.component.ts` — registrar el plugin
- **Sin cambios de API ni backend**
- **Sin breaking changes** — el comportamiento actual de render no se altera cuando el cursor no está sobre el elemento
