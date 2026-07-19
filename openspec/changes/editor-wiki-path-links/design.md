## Context

El editor usa Milkdown con un plugin ProseMirror personalizado (`wikilink.plugin.ts`) que detecta la sintaxis `[[target|label]]`. Al hacer clic sobre un wikilink, el plugin llama a `onNavigate(match[1].trim())` donde `match[1]` es el target crudo (e.g. `wiki/concepts/glutamina`).

La función `navigateToWikilink(target)` en `explorer.component.ts` busca en `allFiles()` — un array plano de `TreeNode` donde `node.label` es el nombre de archivo y `node.data` es la ruta completa relativa al vault (e.g. `wiki/concepts/glutamina.md`). La búsqueda actual solo compara contra `node.label`, por lo que targets con ruta fallan.

## Goals / Non-Goals

**Goals:**
- Resolver `[[wiki/concepts/glutamina|texto]]` navegando al archivo cuya ruta (`data`) sea `wiki/concepts/glutamina.md` o `wiki/concepts/glutamina`
- Mantener compatibilidad con enlaces simples (`[[glutamina|texto]]`) que ya funcionan

**Non-Goals:**
- Cambiar el formato de inserción de wikilinks en el autocompletado
- Resolver ambigüedades cuando varios archivos comparten el mismo nombre en rutas distintas
- Cambios en backend

## Decisions

### Orden de resolución: ruta primero, luego label

Cuando el target contiene `/`, probablemente es una ruta explícita. Si no hay `/`, probablemente es una búsqueda por nombre. El algoritmo de resolución priorizará:
1. Coincidencia exacta por `node.data` (con o sin `.md`)
2. Coincidencia por `node.label` (comportamiento actual, fallback)

**Alternativa descartada — solo buscar por data:** Rompería los enlaces simples existentes que no incluyen ruta.

**Alternativa descartada — normalizar todo a nombre:** Pierde la capacidad de distinguir archivos con mismo nombre en distintas carpetas.

### Un solo cambio localizado

El fix vive exclusivamente en `navigateToWikilink`. No hay que tocar el plugin ni el regex, porque el target ya llega correcto — el problema es solo la búsqueda.

## Risks / Trade-offs

- [Colisión nombre/ruta] Si existe un archivo llamado `wiki/concepts` (improbable en Markdown) y otro en esa ruta, la prioridad por `data` gana. → Aceptable dado que las rutas son más específicas.
- [Case sensitivity] El label-match actual es case-insensitive; el data-match también debe serlo para coherencia. → Aplicar `.toLowerCase()` al comparar `data`.

## Migration Plan

Cambio de una función sin efecto en datos persistidos. No requiere migración.
