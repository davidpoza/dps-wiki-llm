## Why

El editor Milkdown renderiza las imágenes como nodos visuales (WYSIWYG), pero no permite al usuario escribir la sintaxis markdown estándar `![alt](url "title")` para insertarlas. Esto impide crear o editar imágenes desde el teclado sin recurrir a herramientas externas.

## What Changes

- Nuevo plugin ProseMirror `markdown-image.plugin.ts` que intercepta la entrada de texto y convierte la sintaxis `![alt](url "title")` en un nodo imagen de Milkdown al terminar de escribir el `)` final.
- El plugin soporta la sintaxis completa: texto alternativo, URL y título opcional entre comillas.
- El plugin se registra en el editor junto a los plugins ya existentes (`markdown-link`, `wikilink`).

## Capabilities

### New Capabilities

- `markdown-image-input`: Permite al usuario escribir sintaxis `![alt text](url)` o `![alt text](url "title")` directamente en el editor y que se convierta automáticamente en un nodo imagen de Milkdown al cerrar el paréntesis.

### Modified Capabilities

<!-- No hay cambios de requisitos en specs existentes -->

## Impact

- **Archivo nuevo**: `frontend/src/app/components/markdown-image.plugin.ts`
- **Modificado**: `frontend/src/app/components/explorer.component.ts` — registrar el nuevo plugin en la cadena `.use(...)` del editor
- **Sin cambios de API ni backend**
- **Sin breaking changes** — el comportamiento existente de render de imágenes no se altera; solo se añade capacidad de entrada
