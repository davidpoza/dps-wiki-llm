## Context

El editor utiliza **Milkdown** (ProseMirror bajo el capó) con el preset `commonmark`. Ya existe `markdown-link.plugin.ts` que intercepta `handleTextInput` al escribir `)` y convierte `[label](url)` en un nodo enlace de ProseMirror. El preset `commonmark` de Milkdown incluye de fábrica el nodo `image` con attrs `src`, `alt`, `title`.

El problema: Milkdown captura la entrada de texto para la sintaxis imagen (`![alt](url)`) antes de que el usuario pueda completarla — la `!` + `[` desencadena el modo de entrada de imagen de ProseMirror sin permitir escribir la URL después.

## Goals / Non-Goals

**Goals:**
- Permitir que el usuario escriba `![alt text](url)` o `![alt text](url "title")` y obtenga un nodo imagen al cerrar el `)`.
- Soportar alt text con espacios y URL sin comillas.
- Soportar título opcional entre comillas dobles.

**Non-Goals:**
- No se implementa un diálogo UI para insertar imágenes.
- No se valida que la URL apunte a un recurso accesible.
- No se maneja el upload de imágenes.

## Decisions

### 1. Plugin ProseMirror propio (igual que `markdown-link`)

El mismo patrón ya funciona para links. Se crea `markdown-image.plugin.ts` que:
1. En `handleTextInput`, cuando `text === ')'`
2. Busca en el texto previo la regex `!\[([^\[\]]*)\]\(([^() ]+)(?:\s+"([^"]*)")?\)$`
3. Si hay match, elimina el texto raw e inserta un nodo `image` con `{ src, alt, title }`.

**Alternativa descartada — sobrescribir el inputRule de commonmark**: Milkdown expone los `inputRules` del preset pero modificarlos requiere reexportar el schema completo; frágil ante upgrades del preset.

### 2. Regex permisiva para la URL

Se permite cualquier cadena sin espacios ni paréntesis como URL (`[^() ]+`), lo que cubre rutas relativas (`/assets/img.jpg`) y URLs absolutas (`https://...`).

### 3. Título opcional entre comillas dobles

La regex captura opcionalmente `\s+"([^"]*)"` antes del `)`, alineado con el estándar CommonMark para el atributo `title` de la imagen.

## Risks / Trade-offs

- **Conflicto con inputRule nativa de Milkdown para imágenes** → El plugin usa `handleTextInput` que tiene prioridad sobre `inputRules`; se llama `return true` para detener la propagación cuando hay match.
- **Alt text vacío** → Es válido en CommonMark; el plugin lo soporta (grupo de captura puede ser `""`).
- **Imágenes ya renderizadas** → Si el usuario edita un archivo con imágenes, Milkdown ya las muestra como nodos; este plugin solo afecta a la entrada nueva.
