## Why

Al abrir una nota en el editor Milkdown (WYSIWYG) y consultarla en modo raw —o guardarla—, el markdown re-serializado añade líneas en blanco inútiles: una línea vacía **entre cada ítem de una lista** (convierte listas "tight" en "loose") y una línea vacía extra tras el bloque frontmatter. Como el modo raw es exactamente el contenido que se envía al backend y se persiste en el vault, cada apertura+guardado infla los ficheros con saltos de línea espurios y ensucia el historial de versiones y los diffs de git.

## What Changes

- Corregir la serialización Milkdown → markdown para que **preserve las listas "tight"**: no insertar una línea en blanco entre ítems de lista consecutivos cuando el original no la tenía.
- Emitir bullets con marcador `-` (convención del vault/Obsidian) en lugar de `*`, para que Milkdown no reescriba el marcador de cada bullet en el round-trip.
- Preservar el separador original entre el bloque frontmatter y el cuerpo (una línea en blanco o ninguna), en vez de forzar siempre `\n\n`.
- Preservar el YAML del frontmatter **verbatim** (comillas, orden de claves, formato), re-serializándolo solo cuando el usuario lo edita en el panel — el objeto parseado ya no se vuelca con `stringifyYaml` en cada guardado.
- Garantizar que el contenido mostrado en modo raw y el enviado al backend coincidan con el markdown original salvo por los cambios reales de edición (fidelidad de round-trip).
- Añadir cobertura de test para el round-trip de listas y frontmatter.

## Capabilities

### New Capabilities
<!-- Ninguna capability nueva; es una corrección de comportamiento sobre la existente. -->

### Modified Capabilities
- `markdown-editor`: la serialización del cuerpo editado SHALL preservar la "tightness" de las listas y no introducir líneas en blanco espurias; la reconstrucción del fichero completo (frontmatter + cuerpo) SHALL no añadir una línea en blanco extra tras el frontmatter.

## Impact

- **Código frontend**: `frontend/src/app/components/explorer.component.ts` — configuración del editor (`remarkStringifyOptionsCtx` con `bullet: '-'`), listener `markdownUpdated` (post-proceso del markdown serializado), `parseFrontmatter`/`stringifyWithFrontmatter` (separador preservado), y la ruta de guardado/modo raw (`save`, `toggleEditorMode`, `currentFullContent`). Helper puro `markdown-normalize.ts`.
- **Causa raíz**: en `@milkdown/preset-commonmark` 7.21.x, `bulletListSchema`/`orderedListSchema` almacenan `spread` como cadena (`"false"`/`"true"`) y `toMarkdown` la re-emite; en mdast `spread` debe ser booleano, y la cadena `"false"` es *truthy*, por lo que remark serializa la lista como "loose".
- **Sin cambios de API ni de backend**; sin migraciones. Efecto secundario positivo: diffs de git y snapshots de versiones más limpios.
- **Riesgo**: la normalización no debe alterar listas intencionadamente "loose" (con varios párrafos por ítem) ni el contenido dentro de bloques de código.
