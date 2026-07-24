## Context

El explorador (`explorer.component.ts`) utiliza una señal `sidebarPanel` de tipo `'collapsed' | 'files' | 'toc'` para controlar qué panel lateral se muestra. Actualmente el área principal siempre muestra el editor de markdown. No existe ningún endpoint de grafo en el backend; los wikilinks se parsean ya en `BrokenLinkScanService` usando un regex `\[\[([^\]|]+)(?:\|([^\]]+))?\]\]`.

La librería Cytoscape.js se usa ampliamente para grafos de conocimiento (es la base de Obsidian's graph view). Admite layouts de fuerza (`cose` / `fcose`) y actualización dinámica de estilos sin re-renderizar.

## Goals / Non-Goals

**Goals:**
- Añadir `'graph'` al union type de `sidebarPanel` sin romper la lógica existente.
- Crear un componente Angular standalone `GraphViewComponent` que encapsula la instancia de Cytoscape.
- Crear `GraphController` + `GraphService` en Spring Boot para el endpoint `GET /api/graph`.
- Sincronizar controles de ajuste (sliders, checkbox, filtro) con el estado de Cytoscape en tiempo real.
- Abrir la nota en el editor al hacer click en un nodo (navegación Angular Router).

**Non-Goals:**
- Persistencia del layout del grafo (posición de nodos entre sesiones).
- Grafo incremental / diff de cambios recientes.
- Edición de enlaces desde el grafo.
- Soporte mobile optimizado (el grafo se oculta en viewports < 768px, igual que el resto de paneles).

## Decisions

### D1: Cytoscape.js puro (sin wrapper Angular)
Se instala `cytoscape` y `@types/cytoscape` directamente. No se usa ningún wrapper Angular (`ng2-cytoscape`, etc.) porque todos están desactualizados o abandonados. El componente crea la instancia en `ngAfterViewInit` sobre un `<div #graphContainer>` con `ElementRef`. La instancia se destruye en `ngOnDestroy`.

**Alternativa descartada**: D3.js — mayor control pero mucho más código de bajo nivel para gestionar forces y colisiones.

### D2: Layout `fcose` (force-directed compound)
Se usa el plugin `cytoscape-fcose` (mejor distribución que el `cose` nativo). Los parámetros de física del panel de ajustes mapean directamente a las opciones de `fcose`: `gravity` → Center force, `nodeRepulsion` → Repel force, `edgeElasticity` → Link force, `idealEdgeLength` → Link distance.

**Alternativa descartada**: `elk` layout — más preciso pero requiere Web Worker y es más pesado.

### D3: El grafo no reemplaza al editor sino que lo cubre
Cuando `sidebarPanel === 'graph'`, el componente `GraphViewComponent` se inserta en el `section.editor-panel` usando `@if`. El editor de markdown no se destruye (mantiene su estado), simplemente queda oculto detrás del grafo con `display: none` mientras el grafo está activo. Esto evita perder el estado del editor al alternar entre vistas.

### D4: Endpoint backend escanea el vault en cada petición (sin caché)
El vault puede ser modificado externamente (WebDAV, git). Para simplificar, `GET /api/graph` escanea los ficheros en cada llamada. El vault típico tiene < 5.000 notas, lo que es tolerable (< 500ms). Una caché invalidada por eventos del filesystem puede añadirse en el futuro.

**Alternativa descartada**: Caché en memoria con `@EventListener` de cambios — añade complejidad innecesaria para la primera versión.

### D5: Resolución de wikilinks por stem (sin extensión, sin path)
Un `[[quantum]]` resuelve al primer fichero `.md` cuyo nombre de fichero (sin extensión) sea `quantum`, independientemente de su carpeta. Esto replica el comportamiento de Obsidian. El índice de resolución se construye en memoria al inicio del scan.

### D6: Panel de ajustes como componente separado
`GraphSettingsComponent` es un componente Angular standalone que emite eventos via `EventEmitter` / `Output` hacia `ExplorerComponent`. Esto mantiene el fichero del explorador manejable y permite testear los ajustes por separado.

## Risks / Trade-offs

- **[Riesgo] Vaults muy grandes (> 10.000 notas)**: el scan en cada petición puede tardar varios segundos. → Mitigación: spinner de carga explícito; añadir caché en v2 si se reporta lentitud.
- **[Riesgo] Wikilinks ambiguos** (mismo stem en carpetas distintas): D5 resuelve al primero encontrado en orden alfabético, lo que puede crear aristas inesperadas. → Mitigación: documentar este comportamiento; en el futuro usar path completo para desambiguar.
- **[Trade-off] fcose requiere plugin adicional**: añade ~40KB al bundle. Alternativa con `cose` nativo si el tamaño de bundle es una preocupación.
- **[Riesgo] Destrucción del editor al colapsar**: con D3, si el usuario tiene cambios no guardados y abre el grafo, el editor queda oculto pero el estado se preserva. Si por algún motivo Angular destruye el componente (cambio de ruta), se puede perder el contenido. → La lógica de `isDirty` ya existente previene la navegación accidental.

## Migration Plan

1. Instalar dependencias frontend: `npm install cytoscape cytoscape-fcose && npm install -D @types/cytoscape`.
2. Añadir `GraphController` y `GraphService` al backend (sin modificar endpoints existentes).
3. Ampliar `sidebarPanel` type y la lógica de `toggleSidebarPanel` en `explorer.component.ts`.
4. Crear `GraphViewComponent` y `GraphSettingsComponent` como standalone components.
5. Añadir claves i18n en `en.json` y `es.json`.
6. No hay migración de datos ni cambios de base de datos.

## Open Questions

- ¿El grafo debe recordar la posición de los nodos entre sesiones (localStorage)? → No en v1, pero es un candidato obvio para v2.
- ¿Se deben mostrar también los backlinks implícitos (notas mencionadas sin `[[...]]`)? → No en v1; sólo wikilinks explícitos.
