## 1. Backend — Graph Data API

- [x] 1.1 Crear `GraphService.java` que escanea el vault, extrae wikilinks con el regex existente y construye la lista de nodos y aristas
- [x] 1.2 Crear DTOs `GraphNodeDto.java` y `GraphEdgeDto.java` (records) y `GraphResponseDto.java` que los agrupa
- [x] 1.3 Crear `GraphController.java` con `GET /api/graph` protegido por JWT que delega a `GraphService`
- [x] 1.4 Añadir el endpoint a la whitelist de Spring Security (rutas autenticadas)
- [x] 1.5 Verificar manualmente que `GET /api/graph` devuelve `{ nodes, edges }` con datos reales del vault

## 2. Frontend — Instalación de dependencias

- [x] 2.1 Instalar `cytoscape` y `cytoscape-fcose` en `frontend/package.json` (`npm install cytoscape cytoscape-fcose`)
- [x] 2.2 Instalar tipos `@types/cytoscape` como devDependency

## 3. Frontend — Extensión de ExplorerComponent

- [x] 3.1 Ampliar el tipo de `sidebarPanel` signal para incluir `'graph'` → `signal<'collapsed' | 'files' | 'toc' | 'graph'>`
- [x] 3.2 Añadir botón de grafo en la toolbar lateral del template, con `sidebar-btn-active` cuando `sidebarPanel() === 'graph'`
- [x] 3.3 Actualizar `toggleSidebarPanel` para aceptar `'graph'` además de `'files'` y `'toc'`
- [x] 3.4 Añadir bloque `@if (sidebarPanel() === 'graph')` en el panel lateral que renderiza `GraphSettingsComponent`
- [x] 3.5 Añadir bloque `@if (sidebarPanel() === 'graph')` en el área del editor que renderiza `GraphViewComponent` (y oculta el editor con `[hidden]` cuando el grafo está activo)

## 4. Frontend — ApiService: método getGraph()

- [x] 4.1 Añadir método `getGraph()` en `api.service.ts` que hace `GET /api/graph` y retorna `Observable<GraphResponse>`
- [x] 4.2 Definir interfaces TypeScript `GraphNode`, `GraphEdge`, `GraphResponse` en el modelo del servicio

## 5. Frontend — GraphSettingsComponent

- [x] 5.1 Crear `graph-settings.component.ts` como standalone component con inputs: `filterText`, `showOrphans`, `nodeSize`, `lineThickness`, `centerForce`, `repelForce`, `linkForce`, `linkDistance`
- [x] 5.2 Implementar el template HTML del panel: input de filtro, checkbox de huérfanos, y seis sliders con etiquetas i18n
- [x] 5.3 Emitir cambios hacia el padre via `Output` EventEmitters (uno por control o un único `settingsChange` con el objeto completo)
- [x] 5.4 Añadir estilos SCSS para el panel de ajustes (layout vertical, labels alineados, sliders full-width)

## 6. Frontend — GraphViewComponent

- [x] 6.1 Crear `graph-view.component.ts` como standalone component con `@ViewChild('graphContainer') containerRef: ElementRef`
- [x] 6.2 Implementar `ngAfterViewInit`: llamar a `getGraph()`, inicializar instancia Cytoscape con layout `fcose` y tema oscuro/claro coherente con el resto de la app
- [x] 6.3 Implementar click en nodo: navegar a `/explorer/<node-id>` usando `Router.navigate`
- [x] 6.4 Implementar doble-click en nodo: toggle de visibilidad de vecinos exclusivos (colapsar/expandir)
- [x] 6.5 Implementar highlighting del nodo activo: observar la ruta actual y aplicar clase CSS al nodo correspondiente
- [x] 6.6 Implementar método `applyFilter(text: string)`: filtrar nodos por título y ocultar huérfanos si el checkbox está desactivado
- [x] 6.7 Implementar método `applyNodeSize(value: number)`: actualizar `width` y `height` de todos los nodos en el stylesheet de Cytoscape
- [x] 6.8 Implementar método `applyLineThickness(value: number)`: actualizar `width` de edges en el stylesheet
- [x] 6.9 Implementar método `applyPhysics(centerForce, repelForce, linkForce, linkDistance)`: re-ejecutar el layout fcose con los nuevos parámetros
- [x] 6.10 Mostrar spinner de carga mientras la API responde y estado de error si falla
- [x] 6.11 Implementar `ngOnDestroy`: llamar a `cy.destroy()` para liberar la instancia Cytoscape

## 7. Frontend — Internacionalización

- [x] 7.1 Añadir claves i18n en `en.json` bajo la sección `"graph"`: `filterPlaceholder`, `showOrphans`, `nodeSize`, `lineThickness`, `centerForce`, `repelForce`, `linkForce`, `linkDistance`, `loading`, `error`
- [x] 7.2 Añadir las mismas claves en `es.json` con traducción al español
- [x] 7.3 Añadir clave `"graphView"` al botón de la toolbar en ambos ficheros i18n

## 8. Verificación E2E

- [x] 8.1 Verificar que el botón de grafo aparece en la toolbar lateral de `/explorer`
- [x] 8.2 Verificar que activar el grafo sustituye el árbol de archivos por el panel de ajustes
- [x] 8.3 Verificar que el grafo se renderiza con nodos y aristas
- [x] 8.4 Verificar que hacer click en un nodo abre la nota en el editor
- [x] 8.5 Verificar que el doble-click colapsa/expande vecinos del nodo
- [x] 8.6 Verificar que el input de filtro oculta nodos que no coinciden
- [x] 8.7 Verificar que el checkbox de huérfanos oculta/muestra nodos sin conexiones
- [x] 8.8 Verificar que los sliders actualizan el grafo en tiempo real sin recargar
