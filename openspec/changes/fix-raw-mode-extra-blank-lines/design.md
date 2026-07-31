## Context

El editor de notas usa **Milkdown 7.21** (`@milkdown/preset-commonmark` + `preset-gfm`), un editor WYSIWYG basado en ProseMirror. El flujo relevante en `frontend/src/app/components/explorer.component.ts`:

1. `loadFile` → `parseFrontmatter` separa `{frontmatter, body}` y hace `editor.action(replaceAll(body))`.
2. Milkdown parsea el markdown a un documento ProseMirror y, vía el listener `markdownUpdated` (línea ~2102), re-serializa el documento a markdown; el resultado se guarda en `this.currentMarkdown`. Ya existe un post-proceso de cadena en ese listener (línea ~2103) para des-escapar wikilinks (`\[\[…\]\]` → `[[…]]`).
3. El modo raw (`toggleEditorMode`) y el guardado (`save`) usan `currentFullContent()` / `stringifyWithFrontmatter(this.currentMarkdown, fm)` como contenido que se muestra y se envía al backend.

**Causa raíz de los saltos entre ítems de lista:** en `@milkdown/preset-commonmark`, `bulletListSchema.parseMarkdown` guarda el atributo `spread` como **cadena** (`node.spread != null ? String(node.spread) : "false"`), y `bulletListSchema.toMarkdown` lo re-emite tal cual (`spread: node.attrs.spread`). En mdast, `spread` debe ser **booleano**; la cadena `"false"` es *truthy*, de modo que `remark`/`mdast-util-to-markdown` renderiza la lista como "loose" (una línea en blanco entre ítems). Es decir: una lista "tight" del original vuelve como "loose" tras el round-trip, aunque el usuario no la edite.

**Causa del salto extra tras el frontmatter:** `stringifyWithFrontmatter` reconstruye con `---\n<yaml>---\n\n<body>` (doble `\n`), mientras que los ficheros del vault usan un único `\n` (`---\n<body>`).

## Goals / Non-Goals

**Goals:**
- El modo raw y el contenido enviado al backend NO introducen líneas en blanco espurias entre ítems de listas "tight".
- Round-trip idempotente: abrir una nota y guardarla sin editar no cambia el fichero (ni listas ni separación del frontmatter).
- Preservar listas realmente "loose" (ítems con varios bloques/párrafos) y no tocar el interior de bloques de código.
- Cobertura de test unitario para la normalización.

**Non-Goals:**
- No se reescriben ni reemplazan los schemas internos de Milkdown (evitamos acoplarnos a APIs internas del preset).
- No se corrige el escapado de wikilinks malformados del origen (p. ej. `[[…md]` con un solo corchete de cierre); es un problema de calidad del dato de origen, fuera de alcance.
- No se cambia la re-serialización YAML del frontmatter (orden de claves, comillas, formato de listas YAML).
- Sin cambios de backend ni de API.

## Decisions

### Decisión 1 — Normalizar la cadena serializada (post-proceso), no parchear Milkdown

Añadir una función pura `tightenListSerialization(md: string): string` y aplicarla en el listener `markdownUpdated`, justo después del des-escape de wikilinks existente, de modo que `this.currentMarkdown` quede siempre normalizado. Así, tanto el modo raw como el guardado consumen la versión normalizada sin cambios adicionales en esas rutas.

Algoritmo (basado en líneas, consciente de bloques de código):
- Recorrer el texto línea a línea manteniendo el estado de *fenced code block* (``` ` ``` / `~~~`); dentro de un bloque de código no se modifica nada.
- Detectar líneas de ítem de lista con `^\s*([-*+]|\d+[.)])\s+`.
- Eliminar una línea en blanco **solo** cuando la línea no vacía inmediatamente anterior y la inmediatamente posterior sean ambas líneas de ítem de lista. Si el ítem tiene varios párrafos, la línea en blanco va seguida de una continuación indentada (no un marcador de lista) y por tanto se conserva.
- La función SHALL ser idempotente (`f(f(x)) == f(x)`) para no falsear el indicador `isDirty`.

**Por qué esta opción:**
- Coincide con el patrón ya presente en el mismo listener (post-proceso de cadena en la línea ~2103).
- Autocontenida, pura y fácil de testear; sin acoplamiento a las estructuras internas de ProseMirror/mdast de Milkdown, que pueden cambiar entre versiones.

**Alternativa considerada — override del schema de Milkdown:** redefinir `toMarkdown` de `bulletList`/`orderedList`/`listItem` para coaccionar `spread` a booleano (`spread === true || spread === 'true'`). Es la corrección "de raíz" y distingue perfectamente tight/loose incluso con ítems de una sola línea, pero exige reemplazar schemas internos del preset (más código y acoplado a la versión de Milkdown). Se descarta por mantenibilidad; si en el futuro se necesita distinguir listas "loose" de ítem único, se reconsiderará.

**Trade-off aceptado:** a nivel de cadena no se puede distinguir una lista "loose" *de ítems de una sola línea* de una "tight" inflada por Milkdown (ambas se serializan igual); ambas se colapsan a "tight". Para notas de una sola línea por ítem, "tight" es además el resultado esperado. Las listas "loose" con ítems multi-párrafo sí se preservan.

### Decisión 2 — Preservar el separador original del frontmatter (no hardcodear)

**Hallazgo durante la implementación:** el vault es inconsistente. Notas de origen web (p. ej. `collagenous-colitis`) usan `---\n<body>` (sin línea en blanco), mientras que notas de concepto (p. ej. `colitis-microscopica.md`) usan `---\n\n<body>` (con línea en blanco). Hardcodear cualquiera de los dos rompería la idempotencia para el otro grupo y contradiría el Goal de round-trip idempotente.

**Decisión:** `parseFrontmatter` captura el separador exacto entre el `---` de cierre y el cuerpo (uno o dos saltos), despoja los saltos iniciales del cuerpo y devuelve `separator`. Se guarda en el campo `frontmatterSeparator` al cargar/recargar un fichero (y al volver de modo raw). `stringifyWithFrontmatter` reconstruye con `` `---\n${yaml}---${this.frontmatterSeparator}${body}` ``. Como `currentFullContent()` y `save()` pasan por esta función, el modo raw y el guardado quedan cubiertos, y el round-trip es idempotente para ambas convenciones.

**Alternativa descartada — hardcodear un único `\n`:** más simple, pero al ser el vault inconsistente introduciría churn (quitaría la línea en blanco a las notas que sí la tenían) y violaría el Goal de idempotencia.

## Risks / Trade-offs

- [La normalización colapsa listas "loose" de ítem único a "tight"] → Aceptado; para ítems de una sola línea el render tight es el esperado, y los ítems multi-párrafo se preservan por diseño del algoritmo. Documentado en el spec.
- [Regex/estado de code-fence mal gestionado podría tocar contenido de bloques de código] → Mitigado rastreando explícitamente aperturas/cierres de fences y cubriéndolo con test dedicado.
- [Normalización no idempotente falsearía `isDirty`] → Mitigado con test de idempotencia; el algoritmo tight→tight es estable.
- [Churn puntual en git] → Al abrir+guardar notas ya infladas, se limpiarán las líneas en blanco (diff de una sola vez). Es el efecto deseado; no requiere migración masiva.

## Migration Plan

Cambio puramente frontend. Deploy normal del frontend; sin migraciones de datos. Los ficheros ya inflados se corrigen de forma natural la próxima vez que se abran y guarden. Rollback = revertir el commit (no hay estado persistente afectado).

## Open Questions

- ¿Se desea una limpieza masiva (script) de las notas ya infladas por el bug, o basta con la corrección incremental al editar? (Propuesta: incremental; abrir issue aparte si se quiere el script.)
