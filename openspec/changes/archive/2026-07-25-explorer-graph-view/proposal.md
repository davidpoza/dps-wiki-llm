## Why

El explorador carece de una visualización de las conexiones entre notas, lo que dificulta descubrir relaciones y navegar el conocimiento de forma global. Una vista de grafo tipo Obsidian convierte los wikilinks (`[[...]]`) del vault en un mapa interactivo que hace la estructura del conocimiento inmediatamente visible.

## What Changes

- Se añade un botón de grafo a la toolbar lateral de `/explorer` (junto a los botones de Files y TOC).
- Cuando se activa, el panel lateral (actualmente `p-tree`) muestra los controles de configuración del grafo en lugar del árbol de archivos.
- Se añade un componente `GraphViewComponent` que ocupa el área del editor cuando está activo, renderizado con Cytoscape.js.
- Los nodos son notas; las aristas son wikilinks `[[...]]` extraídos del contenido de cada nota.
- Hacer click en un nodo abre la nota correspondiente en el editor.
- Los nodos se pueden colapsar/expandir para ocultar vecinos.
- El panel de ajustes incluye: filtro de texto, checkbox de huérfanos, y sliders para tamaño de nodo, grosor de línea, fuerza central, fuerza de repulsión, fuerza de enlace y distancia de enlace.
- Nuevo endpoint backend `GET /api/graph` que devuelve nodos y aristas del vault.

## Capabilities

### New Capabilities

- `explorer-graph-view`: Vista de grafo interactivo Cytoscape.js en el explorador, con panel de ajustes lateral, filtros, física configurable y navegación por click a nota.
- `graph-data-api`: Endpoint backend `GET /api/graph` que extrae todos los nodos (notas .md) y aristas (wikilinks `[[...]]`) del vault y los devuelve como JSON.

### Modified Capabilities

- `explorer-file-routing`: Se amplía `sidebarPanel` para incluir el valor `'graph'`, que activa la vista de grafo y el panel de ajustes en lugar del árbol de archivos.

## Impact

- **Frontend**: `explorer.component.ts` (nuevo panel state `'graph'`), nuevo `graph-view.component.ts`, instalación de `cytoscape` y `@types/cytoscape` en `frontend/package.json`.
- **Backend**: Nuevo `GraphController.java` y `GraphService.java` que recorren el vault, parsean wikilinks y devuelven `{ nodes: [], edges: [] }`.
- **Sin breaking changes en la API existente**: el endpoint es aditivo.
- **Traducciones**: nuevas claves i18n para el panel de ajustes del grafo.
