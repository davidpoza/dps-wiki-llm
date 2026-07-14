## Context

El editor usa Milkdown con el preset `commonmark`, que registra todos los nodos de bloque (heading, blockquote, bullet_list, ordered_list, list_item, code_block, horizontal_rule) y los marks inline (strong, emphasis, link, inlineCode, image) como nodos/marks ProseMirror nativos. El plugin `live-preview.plugin.ts` ya implementa cursor-expand para marks inline: al entrar el cursor, reemplaza el mark renderizado por su texto raw y lo restaura al salir. Los nodos de bloque no tienen este tratamiento. Adicionalmente, el plugin `markdown-link.plugin.ts` solo convierte `[texto](url)` (inline link); los reference-style links `[texto][ref]` no tienen soporte.

## Goals / Non-Goals

**Goals:**
- Extender el cursor-expand del live preview a nodos de bloque: heading (h1-h6), blockquote, list items (bullet y ordered), code block, y horizontal rule.
- Añadir soporte para reference-style links: detección al escribir `[texto][ref]` y resolución de la definición `[ref]: url`.
- Completar el CSS del editor para que todos los elementos markdown sean visualmente distinguibles en estado renderizado.

**Non-Goals:**
- Syntax highlighting dentro de code blocks.
- Soporte de tablas GFM.
- Modo de edición de markdown "source" (split-pane).
- Soporte de wikilinks de tipo `![[embed]]` (embedded images).

## Decisions

### 1. Mismo patrón de plugin key para bloques

**Decisión:** Reutilizar el plugin key `live-preview` y el mecanismo `appendTransaction` existente, extendiendo `findMarkAtCursor` con una nueva función `findBlockAtCursor` que detecta cuándo el cursor está dentro de un nodo de bloque soportado.

**Alternativas consideradas:**
- Crear un plugin separado por cada tipo de bloque → demasiada duplicación, complejidad de interacción entre plugins.
- Usar decorations en lugar de reemplazar el nodo → más complejo y potencialmente inconsistente con el estado del documento.

**Rationale:** El patrón actual ya resuelve el ciclo expand/collapse con el meta key `lp-meta`. Extenderlo es más seguro que introducir nuevos mecanismos.

### 2. Serialización de bloques a markdown raw

**Decisión:** Implementar funciones `serializeBlockToMarkdown(node, schema)` específicas para cada tipo de nodo de bloque. Al expandir, el bloque se reemplaza por un párrafo temporal con el texto raw; al colapsar, se parsea con una función `parseMarkdownToBlock(raw, schema)` que devuelve el nodo reconstruido.

**Alternativas consideradas:**
- Usar el serializer de Milkdown (`getMarkdown`) sobre el subnodo → requiere acceso al editor context dentro del plugin, acoplamiento excesivo.
- Serialización manual por regex → suficiente para los tipos soportados y sin dependencias.

**Scope de serialización:**
- Heading: `# ` a `###### ` según `node.attrs.level` + texto hijo
- Blockquote: `> ` + texto hijo (primer párrafo del blockquote)
- Bullet list item: `- ` + texto hijo del list_item
- Ordered list item: `1. ` + texto hijo (número real si es accesible)
- Code block: ` ```lang\ncontent\n``` ` con `node.attrs.language`
- Horizontal rule: `---`

### 3. Reference-style links

**Decisión:** Detectar el patrón `[texto][ref]` en `handleTextInput` al presionar `]`. Buscar en el texto del documento la definición `[ref]: url` para resolver la URL. Si se encuentra, crear el mark `link` igual que el inline link. Si no se encuentra, dejar el texto sin convertir para no perder datos.

**Alternativas consideradas:**
- Resolver en tiempo de render con decorations → no compatible con el modelo ProseMirror de Milkdown que emite markdown plano.
- Parsear con un mini-parser markdown al cargar el archivo → cambia el modelo de datos subyacente innecesariamente.

### 4. CSS con `::ng-deep`

**Decisión:** Añadir reglas CSS en `explorer.component.ts` dentro de `:host ::ng-deep .milkdown` para todos los elementos de bloque. Milkdown ya aplica clases semánticas a los nodos, por lo que solo falta estilizarlos.

**Estilos críticos:**
- `h1`-`h6`: tamaños relativos y `font-weight: bold`
- `blockquote`: `border-left`, `padding-left`, color gris
- `ul`, `ol`: `list-style`, `padding-left`
- `pre code`: `background`, `font-family: monospace`, `border-radius`
- `hr`: `border`, `margin`

## Risks / Trade-offs

- **Nodo blockquote multilineal** → Mitigación: expandir solo el primer párrafo hijo; si el blockquote tiene múltiples párrafos, colapsar/expandir puede perder estructura. Aceptar esta limitación v1 y documentarla.
- **Ordered list: número de ítem** → ProseMirror no expone el número calculado en el nodo list_item directamente. Mitigación: serializar siempre como `1.` (CommonMark lo renumera en el output serializado).
- **Reference links sin definición en el documento** → no se convierte, el texto queda literal. No es pérdida de datos pero sí falta de conveniencia. Aceptable para v1.
- **Expand de code block con saltos de línea** → el párrafo temporal contendrá `\n` literales que ProseMirror trata como hardbreak o separator. Mitigación: usar un nodo `code_block` desnudo sin fences como "estado expandido" para preservar la edición multilínea, y solo mostrar fences al colapsar.
