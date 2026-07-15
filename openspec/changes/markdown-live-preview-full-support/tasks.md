## 1. CSS - Estilos visuales para elementos de bloque

- [x] 1.1 Añadir estilos `h1`-`h6` en `:host ::ng-deep .milkdown` con tamaños decrecientes y `font-weight: bold`
- [x] 1.2 Añadir estilo para `blockquote`: borde izquierdo de color, padding, color de texto gris
- [x] 1.3 Añadir estilos para `ul` y `ol` con `list-style` correcto y `padding-left`
- [x] 1.4 Añadir estilo para `pre` y `pre code` con fondo diferenciado y fuente monoespaciada
- [x] 1.5 Añadir estilo para `hr` con borde visible y márgenes verticales

## 2. Reference-style links

- [x] 2.1 En `markdown-link.plugin.ts`, añadir `handleTextInput` para el patrón `[texto][ref]` al pulsar `]`
- [x] 2.2 Implementar función `resolveRefLink(ref, docText)` que busca `[ref]: url` en el texto del documento
- [x] 2.3 Si se encuentra la definición, crear el mark `link` igual que en los inline links
- [x] 2.4 Añadir `handleTextInput` para autolinks `<url>` y `<email>` al pulsar `>`

## 3. Serialización de nodos de bloque

- [x] 3.1 En `live-preview.plugin.ts`, implementar `serializeHeadingToMarkdown(node)` → `# texto` según `node.attrs.level`
- [x] 3.2 Implementar `serializeBlockquoteToMarkdown(node)` → `> texto` del primer párrafo hijo
- [x] 3.3 Implementar `serializeListItemToMarkdown(node, isBullet)` → `- texto` o `1. texto`
- [x] 3.4 Implementar `serializeCodeBlockToMarkdown(node)` → ` ```lang\ncontent\n``` `
- [x] 3.5 Implementar `serializeHrToMarkdown()` → `---`

## 4. Parseo de markdown raw de vuelta a nodos de bloque

- [x] 4.1 Implementar `parseMarkdownToBlock(raw, schema)` que detecta `#`-`######` y retorna nodo heading
- [x] 4.2 Extender `parseMarkdownToBlock` para detectar `> ` y retornar nodo blockquote
- [x] 4.3 Extender `parseMarkdownToBlock` para detectar `- ` o `* ` y retornar nodo bullet list_item
- [x] 4.4 Extender `parseMarkdownToBlock` para detectar `\d+\. ` y retornar nodo ordered list_item
- [x] 4.5 Extender `parseMarkdownToBlock` para detectar fences ` ``` ` y retornar nodo code_block con lenguaje
- [x] 4.6 Extender `parseMarkdownToBlock` para detectar `---` / `***` / `___` y retornar nodo horizontal_rule

## 5. Detección de cursor en nodo de bloque

- [x] 5.1 Implementar `findBlockAtCursor(state)` que detecta si el cursor está dentro de un nodo de bloque soportado y retorna `{ from, to, node }` o `null`
- [x] 5.2 Integrar `findBlockAtCursor` en el `appendTransaction` del plugin: si retorna un resultado, expandir el bloque a raw text como párrafo temporal
- [x] 5.3 Gestionar el colapso al salir el cursor: parsear el párrafo temporal de vuelta al nodo de bloque original

## 6. Verificación y ajuste fino

- [x] 6.1 Verificar que headings h1-h6 expanden y colapsan correctamente
- [x] 6.2 Verificar que blockquotes expanden y colapsan, y que eliminar `> ` convierte en párrafo
- [x] 6.3 Verificar que bullet y ordered list items expanden y colapsan
- [x] 6.4 Verificar que code blocks expanden con fences y colapsan preservando lenguaje
- [x] 6.5 Verificar que horizontal rules expanden a `---` y vuelven a `<hr>`
- [x] 6.6 Verificar que reference links `[texto][ref]` se convierten cuando existe la definición
- [x] 6.7 Verificar que autolinks `<url>` se convierten correctamente
- [x] 6.8 Verificar que todos los estilos CSS son visibles con contenido de prueba
