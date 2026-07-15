## Context

El editor usa **Milkdown** (ProseMirror) con el preset `commonmark`. ProseMirror renderiza los elementos inline mediante "marks" (link, strong, em, code) y nodos atómicos (image). Cuando el cursor se mueve con las teclas de flecha, ProseMirror lo posiciona dentro del texto del mark o salta el nodo atómico, pero el usuario solo ve el render visual — nunca el texto raw.

El patrón "live preview" de Obsidian (Live Editor sobre CodeMirror 6) expande/colapsa elementos según la posición del cursor. Debemos replicarlo en ProseMirror usando decoraciones inline.

Ya existen `markdown-link.plugin.ts` y `markdown-image.plugin.ts` que manejan la **entrada** de estos elementos. Este plugin maneja la **edición** de los ya existentes.

## Goals / Non-Goals

**Goals:**
- Cuando el cursor entra en un mark `link`, `strong`, `em` o `code`, mostrar el texto raw markdown del elemento y permitir editarlo.
- Cuando el cursor entra en un nodo `image`, mostrar la sintaxis `![alt](src "title")` editable.
- Cuando el cursor sale del elemento, re-renderizar el formato visual.
- Los cambios en el texto raw se reflejan en el documento ProseMirror al salir.

**Non-Goals:**
- No se implementa para elementos de bloque (headings, listas, blockquotes) — solo inline.
- No se implementa un panel/tooltip flotante — la expansión es inline en el propio flujo de texto.
- No se afecta al markdown de wikilinkss (`[[...]]`) — ya tienen su propio tratamiento.

## Decisions

### 1. Decoración de reemplazo (NodeView inline) en lugar de mutación del documento

Cuando el cursor entra en un elemento, NO se modifica el documento ProseMirror (no se convierte el nodo a texto plano). En su lugar, se añade una **decoración `Decoration.widget`** que:
- Oculta el render original con CSS (`display:none` o `visibility:hidden`)
- Inserta un `<span contenteditable="true">` con la sintaxis markdown raw como contenido

Al salir del elemento, se retira la decoración y se aplica la edición al documento mediante una transacción.

**Alternativa descartada — mutar el doc**: Convertir el mark/nodo a texto plano en el doc y volver a parsearlo al salir es frágil: el parser puede producir resultados distintos, y las transacciones dobles crean ruido en el historial de undo/redo.

### 2. Serialización de marks a markdown raw

Para cada tipo de mark/nodo:
- `link`: `[{texto}]({href})` o `[{texto}]({href} "{title}")` si title existe
- `strong`: `**{texto}**`
- `em`: `_{texto}_`
- `code`: `` `{texto}` ``
- `image`: `![{alt}]({src})` o `![{alt}]({src} "{title}")` si title existe

La serialización se realiza leyendo los atributos del mark y el texto del nodo desde el doc ProseMirror.

### 3. Detección de posición del cursor

El plugin usa `Plugin.view.update(view)` para observar cambios de selección. Compara la selección anterior con la nueva. Si la selección cambia de estar dentro de un mark/nodo a estar fuera (o viceversa), actualiza el estado del plugin y regenera las decoraciones.

### 4. Aplicación de ediciones al salir

Cuando el cursor sale del elemento expandido, el plugin:
1. Lee el texto del `<span>` editable
2. Re-parsea el texto markdown (usando las reglas inversas de serialización)
3. Aplica una transacción ProseMirror que reemplaza el range del elemento

Si el usuario no cambió nada, no se emite transacción para no contaminar el historial de undo.

## Risks / Trade-offs

- **Parpadeo visual al entrar/salir** → Mitigación: usar transiciones CSS cortas (100ms) o eliminarlas si el parpadeo es mínimo.
- **Cursor dentro del span editable vs. cursor ProseMirror** → El span contenteditable tiene su propio cursor DOM; al terminar la edición hay que sincronizarlo con ProseMirror. Esto puede ser complejo. Alternativa más simple: usar `Decoration.inline` para resaltar el range y sobrescribir el render con CSS `::before`/`::after`, sin contenteditable separado.
- **Nodos image son atómicos** → ProseMirror los trata como un punto único de cursor. Cuando el cursor "entra" en la imagen (la selecciona), se muestra la sintaxis; al deseleccionar se vuelve al render.
- **Conflicto con undo/redo** → Si se aplican transacciones al entrar y al salir, el historial de undo puede quedar ruidoso. Mitigación: usar `tr.setMeta('addToHistory', false)` para las transacciones de expansión/colapso.
