## 1. Crear el plugin markdown-image

- [x] 1.1 Crear `frontend/src/app/components/markdown-image.plugin.ts` con el plugin ProseMirror que intercepta `handleTextInput` cuando `text === ')'` y aplica la regex `!\[([^\[\]]*)\]\(([^() ]+)(?:\s+"([^"]*)")?\)$` sobre el texto anterior al cursor
- [x] 1.2 En caso de match, eliminar el texto raw del documento e insertar un nodo `image` con attrs `{ src, alt, title }` usando el schema de Milkdown

## 2. Registrar el plugin en el editor

- [x] 2.1 En `frontend/src/app/components/explorer.component.ts`, importar `createMarkdownImagePlugin` desde `./markdown-image.plugin`
- [x] 2.2 Añadir `.use(createMarkdownImagePlugin())` en la cadena de construcción del editor, junto a los plugins existentes

## 3. Verificación manual

- [x] 3.1 Verificar que escribir `![alt](/assets/img.jpg)` inserta un nodo imagen con src y alt correctos
- [x] 3.2 Verificar que escribir `![foto](https://example.com/f.png "Título")` inserta nodo imagen con src, alt y title correctos
- [x] 3.3 Verificar que `![](/icon.png)` funciona con alt vacío
- [x] 3.4 Verificar que texto normal terminado en `)` (por ejemplo `función()`) no se ve afectado
