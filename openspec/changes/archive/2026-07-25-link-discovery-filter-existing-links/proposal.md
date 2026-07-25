## Why

El modal de Link Discovery muestra todos los resultados devueltos por el backend, incluyendo notas que ya están enlazadas en el contenido actual de la nota. Esto genera ruido y puede llevar a añadir enlaces duplicados que ya existen en cualquier punto del documento (no solo en la sección Related).

## What Changes

- Al recibir los resultados de descubrimiento, filtrar los `DiscoveredLink` cuyos slugs ya aparezcan como wikilinks (`[[slug]]`) en cualquier parte del contenido actual de la nota.
- El filtrado ocurre en el frontend, en `openLinkDiscovery()`, antes de asignar los resultados a `linkDiscoveryResults`.

## Capabilities

### New Capabilities

- `link-discovery-filter-existing`: Filtrado de enlaces ya presentes en la nota al mostrar resultados de Link Discovery.

### Modified Capabilities

- `link-discovery-add-to-related`: El modal ya filtra duplicados al insertar en Related; ahora también los oculta desde el momento en que se muestran los resultados.

## Impact

- `frontend/src/app/components/explorer.component.ts`: método `openLinkDiscovery()`, lógica de procesamiento del evento `done`.
- Sin cambios en backend ni en API.
