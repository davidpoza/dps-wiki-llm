## 1. Serializador markdown inline

- [x] 1.1 Crear `frontend/src/app/components/live-preview.plugin.ts` con función `serializeMarkToMarkdown(mark, text): string` que convierte mark+texto a sintaxis raw: link → `[texto](url)` / `[texto](url "title")`, strong → `**texto**`, em → `_texto_`, code → `` `texto` ``
- [x] 1.2 Añadir función `serializeImageToMarkdown(node): string` que convierte nodo image a `![alt](src)` / `![alt](src "title")`
- [x] 1.3 Añadir función `parseMarkdownToMark(raw, schema): {mark, text} | null` que parsea el texto raw editado y devuelve el mark actualizado (inversas de las reglas de serialización)

## 2. Plugin ProseMirror de expansión

- [x] 2.1 Implementar el estado del plugin: mantiene `expandedRange: {from, to, type} | null` indicando qué rango está actualmente expandido
- [x] 2.2 En `Plugin.view.update(view)` detectar si la selección entró o salió de un mark/nodo inline; actualizar el estado del plugin y disparar `updateDecorations`
- [x] 2.3 Implementar `buildDecorations(state)`: cuando hay `expandedRange`, añadir `Decoration.widget` que oculta el render original e inserta un `<span contenteditable="true">` con el texto markdown raw
- [x] 2.4 Al salir del elemento expandido, leer el texto del `<span>`, llamar `parseMarkdownToMark`, aplicar la transacción ProseMirror con `tr.setMeta('addToHistory', false)` si no hubo cambios, o transacción normal si el usuario editó

## 3. Registro en el editor

- [x] 3.1 En `frontend/src/app/components/explorer.component.ts`, importar y añadir `.use(createLivePreviewPlugin())` en la cadena de construcción del editor

## 4. Verificación manual

- [x] 4.1 Verificar que navegar con flecha dentro de un link muestra `[texto](url)` editable y al salir vuelve a renderizarse
- [x] 4.2 Verificar que editar la URL dentro del texto raw actualiza el link al salir
- [x] 4.3 Verificar que navegar sobre una imagen muestra `![alt](src)` editable
- [x] 4.4 Verificar que `**negrita**`, `_cursiva_` y `` `código` `` se expanden al entrar y colapsan al salir
- [x] 4.5 Verificar que texto plano (sin marks) no se ve afectado
