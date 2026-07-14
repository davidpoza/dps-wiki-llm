## Why

El editor Milkdown ya renderiza correctamente los elementos de bloque (headings, listas, blockquotes, code blocks, hr) como nodos ProseMirror nativos, pero el comportamiento de live preview al estilo Typora (expandir a markdown raw al entrar el cursor y volver al render renderizado al salir) solo está implementado para marks inline: `link`, `strong`, `emphasis`, `inlineCode` e `image`. Los elementos de bloque no expanden a su sintaxis raw cuando el cursor está dentro, y los links de tipo referencia (`[texto][ref]`) no se reconocen ni en la creación ni en el expand.

## What Changes

- Extender `live-preview.plugin.ts` para cubrir nodos de bloque: `heading`, `blockquote`, `bullet_list`/`ordered_list` items, `fence` (code block), y `horizontal_rule`.
- Cuando el cursor entra en un nodo de bloque soportado, reemplazarlo temporalmente por un párrafo con su sintaxis markdown raw editable; al salir, parsear de vuelta al nodo original.
- Añadir soporte de **reference-style links** en `markdown-link.plugin.ts`: crear el nodo link al completar `[texto][ref]` y resolver la referencia, además del ya existente `[texto](url)`.
- Asegurar que todos los elementos tengan CSS correcto en el editor (headings, listas, blockquotes, code blocks, hr) para que se distingan visualmente cuando NO están expandidos.

## Capabilities

### New Capabilities

- `block-cursor-expand`: Expandir nodos de bloque (heading, blockquote, list item, code block, hr) a markdown raw editable cuando el cursor entra, y re-renderizarlos al salir.
- `reference-link-support`: Soporte de links en formato referencia `[texto][ref]` con definición `[ref]: url`.

### Modified Capabilities

- `live-preview-cursor-expand`: Se modifica para incluir los nuevos tipos de nodo de bloque junto con los inline ya existentes.

## Impact

- `frontend/src/app/components/live-preview.plugin.ts` — lógica principal ampliada
- `frontend/src/app/components/markdown-link.plugin.ts` — soporte de reference links
- `frontend/src/app/components/explorer.component.ts` — CSS adicional para todos los elementos markdown renderizados (`::ng-deep .milkdown`)
