## Why

El editor Milkdown usa `@milkdown/preset-commonmark`, que no incluye tablas GFM. Los usuarios que escriben notas con tablas Markdown ven el texto crudo en lugar de una tabla renderizada, lo que rompe la experiencia de edición frente a cualquier otro editor Markdown moderno.

## What Changes

- Activar el preset GFM de Milkdown (`@milkdown/preset-gfm`) para que las tablas se rendericen como elementos `<table>` nativos del editor.
- Añadir soporte de live preview para tablas: cuando el cursor entra en una tabla renderizada, ésta se expande a su sintaxis Markdown raw (`| col | col |` / `|---|---|`); al salir, se vuelve a colapsar como tabla renderizada.
- Añadir estilos CSS para que las tablas renderizadas tengan buen aspecto dentro del tema oscuro/claro de la aplicación.

## Capabilities

### New Capabilities

- `markdown-table-rendering`: Renderizado de tablas GFM en el editor Milkdown con live preview (expand/collapse al entrar/salir con el cursor).

### Modified Capabilities

<!-- No existing spec-level requirements change -->

## Impact

- **Frontend únicamente**: cambios en `explorer.component.ts` (activar preset GFM), `live-preview.plugin.ts` (añadir serializer/parser/detector de tablas), y estilos CSS del editor.
- **Dependencia nueva**: `@milkdown/preset-gfm` (ya disponible en el ecosistema Milkdown; verificar si está en `package.json` o hay que añadirla).
- **Sin cambios en backend**: las tablas son sintaxis Markdown estándar GFM; el contenido se almacena como texto plano sin modificar.
