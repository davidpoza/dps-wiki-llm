## 1. Estado de selección en ExplorerComponent

- [x] 1.1 Añadir signal `linkDiscoverySelected = signal<Set<string>>(new Set())` en `ExplorerComponent`
- [x] 1.2 Resetear `linkDiscoverySelected` a `new Set()` en `openLinkDiscovery()` junto al reset de los demás signals
- [x] 1.3 Añadir computed `linkDiscoveryAllSelected` que sea `true` cuando el tamaño del set iguala `linkDiscoveryResults().length`

## 2. Template del modal de link discovery

- [x] 2.1 Importar `Checkbox` de PrimeNG en las imports del componente (ya importado en BrokenLinksModal — verificar si ExplorerComponent lo necesita)
- [x] 2.2 Importar `FormsModule` si no está ya disponible en ExplorerComponent
- [x] 2.3 En el bloque `@for (link of linkDiscoveryResults(); ...)`, reemplazar `<div class="ld-result-item" (click)="navigateToDiscoveredLink(link.path)">` por un div sin `(click)` de navegación y añadir `<p-checkbox>` al inicio de cada ítem
- [x] 2.4 Añadir fila de "Marcar todos / Desmarcar todos" encima de la lista de resultados (visible solo cuando hay resultados)
- [x] 2.5 Añadir botón "Añadir a Related" en `<ng-template pTemplate="footer">` junto al botón "Cerrar", deshabilitado si `linkDiscoverySelected().size === 0`

## 3. Lógica de selección

- [x] 3.1 Añadir método `toggleLinkDiscovery(path: string)` que añade/quita el path del set `linkDiscoverySelected`
- [x] 3.2 Añadir método `isLinkDiscoverySelected(path: string): boolean` que comprueba si el path está en el set
- [x] 3.3 Añadir método `toggleAllLinkDiscovery()` que selecciona todos si no están todos seleccionados, o deselecciona todos si lo están

## 4. Inserción en la sección Related

- [x] 4.1 Añadir método privado `slugFromPath(path: string): string` que extrae el nombre de fichero sin extensión (ej. `wiki/entities/My Note.md` → `My Note`)
- [x] 4.2 Añadir método `addSelectedLinksToRelated()` que:
  - Obtiene los paths seleccionados de `linkDiscoverySelected()`
  - Convierte cada path a slug con `slugFromPath()`
  - Parsea `currentMarkdown` para localizar la sección `## Related`
  - Si existe, extrae los slugs existentes y añade solo los nuevos (sin duplicados)
  - Si no existe, crea la sección antes de `## Sources` o al final del documento
  - Actualiza `currentMarkdown` con el nuevo contenido
  - Llama a `this.editor.action(replaceAll(this.currentMarkdown))` para sincronizar el editor
  - Marca `isDirty` y llama a `save()`
  - Cierra el modal (`showLinkDiscovery.set(false)`)

## 5. Estilos

- [x] 5.1 Actualizar estilos de `.ld-result-item` para alinear el checkbox con el contenido (display flex, gap)
- [x] 5.2 Añadir fila de controles `ld-selection-row` con flex + space-between para el contador de seleccionados y el botón "Marcar todos"
