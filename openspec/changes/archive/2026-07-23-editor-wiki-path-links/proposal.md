## Why

El editor markdown solo resuelve wikilinks por nombre de archivo (label), ignorando la parte de ruta del target. Los enlaces del tipo `[[wiki/concepts/glutamina|glutamina]]` no funcionan porque `wiki/concepts/glutamina` no coincide con ningún label del árbol de archivos.

## What Changes

- `navigateToWikilink` en `explorer.component.ts` pasa a resolver el target también contra el campo `data` (ruta completa) de los nodos del árbol, con y sin extensión `.md`.
- Se mantiene la resolución actual por label para compatibilidad con enlaces simples (`[[glutamina|glutamina]]`).

## Capabilities

### New Capabilities

- `wiki-path-link-navigation`: Resolución de wikilinks que incluyen ruta de carpeta como prefijo (e.g. `[[wiki/concepts/glutamina|texto]]`), buscando contra la ruta completa del archivo además del nombre.

### Modified Capabilities

<!-- ninguna -->

## Impact

- **Archivo**: `frontend/src/app/components/explorer.component.ts` — método `navigateToWikilink`
- Sin cambios de API, sin cambios de backend, sin nuevas dependencias
- Compatible hacia atrás: los enlaces simples siguen funcionando
