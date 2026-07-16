## Context

El editor usa Milkdown 7.21.3 con `@milkdown/preset-commonmark`. El paquete `@milkdown/preset-gfm` **no está instalado** ni listado en `package.json`. El plugin de live preview (`live-preview.plugin.ts`) gestiona la expansión/colapso de nodos inline (`link`, `strong`, `emphasis`, `inlineCode`) y bloques de una sola línea (`heading`, `blockquote`, `hr`): cuando el cursor entra en uno de estos nodos renderizados, se convierte en un `paragraph` con el texto Markdown raw; al salir, se parsea de vuelta al nodo original.

Las tablas GFM son bloques multi-línea (`| col | col |\n|---|---|\n| a | b |`), lo que las hace incompatibles con el mecanismo actual que asume un único `paragraph` de una línea.

## Goals / Non-Goals

**Goals:**
- Renderizar tablas GFM en el editor (instalar `@milkdown/preset-gfm` o alternativa compatible con 7.21.3).
- Live preview de tablas: cursor dentro → tabla se expande a Markdown raw; cursor fuera → vuelve a tabla renderizada.
- Estilos CSS adecuados para las tablas en el tema de la aplicación.

**Non-Goals:**
- Toolbar de edición de tablas (añadir/eliminar filas y columnas via UI).
- Soporte de otras extensiones GFM (task lists, strikethrough, autolinks) — sólo tablas.
- Cambios en backend o en el formato de almacenamiento.

## Decisions

### D1: Paquete para tablas — `@milkdown/preset-gfm`

**Decisión**: Instalar `@milkdown/preset-gfm@7.x` (misma línea de versión que el resto del stack Milkdown).

**Alternativa descartada — Prosemirror-tables directo**: Requeriría escribir manualmente los comandos de tabla, el schema, los InputRules y el serializer. El preset GFM ya los incluye y mantiene la coherencia con el resto del stack Milkdown.

**Alternativa descartada — Parsear tablas en commonmark**: CommonMark estándar no incluye tablas; el preset GFM extiende commonmark con el nodo `table` / `table_row` / `table_cell` / `table_header`.

### D2: Live preview de tablas — expansión a `code_block`

**Decisión**: Cuando el cursor entra en un nodo `table`, se reemplaza con un nodo `code_block` que contiene el texto Markdown raw de la tabla. Al salir del `code_block`, si el contenido es una tabla válida GFM, se parsea de vuelta al nodo `table`. Se añade un modo `'table'` al estado del plugin LP para distinguir esta expansión de un code block normal.

**Alternativa descartada — expandir a `paragraph`**: Un `paragraph` en ProseMirror no renderiza los `\n` como saltos de línea en contenteditable, por lo que una tabla multi-línea aparecería como una única línea ilegible.

**Alternativa descartada — edición directa de celdas sin expand**: El usuario pide la misma UX que el resto de sintaxis (ver Markdown raw al editar). Sin expandir, no se ven los pipes `|` ni los separadores `---`.

### D3: Serialización de tabla a Markdown

El serializer GFM de Milkdown convierte internamente un nodo `table` a su representación Markdown. Para la expansión, se implementará `serializeTableToMarkdown(node: PMNode): string` que recorre filas y celdas del nodo ProseMirror directamente (sin invocar el serializer de Milkdown, que requiere el estado del parser). Salida esperada:

```
| Header 1 | Header 2 |
| --- | --- |
| Cell 1 | Cell 2 |
```

### D4: Parser de Markdown a nodo table

La función `parseMarkdownToTable(raw: string, schema: Schema): PMNode | null` parseará el texto raw con una regex multi-línea. Se usa el mismo patrón que el preset GFM para identificar la fila de separadores `|---|---|`.

## Risks / Trade-offs

- **Compatibilidad de versión**: `@milkdown/preset-gfm@7.x` debe ser compatible con `@milkdown/core@7.21.3`. El ecosistema Milkdown 7 usa versiones sincronizadas; si hay diferencias de patch podría haber warnings pero no debería romper. → Verificar en `pnpm add` y hacer lock.

- **Expansión a code_block**: Si el usuario tiene un code block adyacente a una tabla, el plugin LP debe distinguir si el `code_block` actual es una tabla expandida (state mode='table') o un code block real. El estado del plugin ya discrimina por mode, así que no hay colisión. → El `code_block` de expansión se distingue sólo por el state LP, no por atributos del nodo.

- **Cursor al expandir tabla**: Cuando se expande la tabla, el cursor se coloca al inicio del `code_block`. Para tablas grandes, el usuario puede necesitar hacer scroll. Esto es aceptable dado que es el mismo comportamiento de heading/blockquote.

- **Pérdida de alineación de columnas**: La sintaxis GFM permite especificar alineación (`:---`, `---:`, `:---:`). El serializer simplificado usará `---` por defecto. La alineación se preservará sólo si el parser la reconoce y el nodo la almacena en atributos. → Tarea separada si es necesario; el MVP usa `---`.

## Migration Plan

1. `pnpm add @milkdown/preset-gfm@7.21.3` en el directorio `frontend/`.
2. Activar el preset en `explorer.component.ts` (añadir `.use(gfm)` junto a `.use(commonmark)`).
3. Extender `live-preview.plugin.ts` con serializer, parser y detector de tabla.
4. Añadir CSS para nodos table en el editor.
5. No hay rollback especial — la feature es aditiva; quitar `.use(gfm)` y revertir el plugin restaura el estado anterior.

## Open Questions

- ¿Debe el editor permitir crear tablas desde cero escribiendo `|` como shortcut (InputRule), o sólo renderizarlas si ya existen en el documento? → El preset GFM incluye InputRules para esto; se habilitarán por defecto.
