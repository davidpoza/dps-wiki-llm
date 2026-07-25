## Why

Cualquier nota bajo `wiki/` puede tener keywords en su frontmatter y ser procesada por el job `REGENERATE_KEYWORDS`, pero el botón "Regenerar keywords" del editor solo aparece para `wiki/concepts` y `wiki/sources`. Esto obliga al usuario a ir a Configuración para regenerar keywords de cualquier otra nota dentro de `wiki/`.

## What Changes

- El botón "Regenerar keywords" en la barra de herramientas del editor será visible para cualquier nota bajo `wiki/`.
- El modal de selección de notas en Configuración incluirá todas las notas bajo `wiki/` en su lista.

## Capabilities

### New Capabilities

_(ninguna)_

### Modified Capabilities

- `keyword-regeneration-ui`: Ampliar la elegibilidad de regeneración de keywords a cualquier nota bajo `wiki/`.

## Impact

- `frontend/src/app/components/explorer.component.ts`: ampliar condición en `isKeywordEligible` a `path.startsWith('wiki/')`.
- `frontend/src/app/components/keyword-selection-modal.component.ts`: cargar todas las notas bajo `wiki/` en el modal.
- `openspec/specs/keyword-regeneration-ui/spec.md`: actualizar requisitos para reflejar la nueva elegibilidad.
