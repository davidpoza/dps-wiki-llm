## 1. GlobalSearchService

- [x] 1.1 Crear `frontend/src/app/services/global-search.service.ts` con señal `isOpen` (signal booleano), método `open()`, método `close()`, y signal `pendingNavigation` (string | null) para emitir el path del archivo seleccionado
- [x] 1.2 Añadir método `selectFile(path: string)` que guarda el path en `pendingNavigation` y cierra el modal (`isOpen.set(false)`)

## 2. GlobalSearchModalComponent

- [x] 2.1 Crear `frontend/src/app/components/global-search-modal.component.ts` como standalone component con el template del modal (p-dialog, input de búsqueda, lista de resultados) extraído de `explorer.component.ts`
- [x] 2.2 Inyectar `GlobalSearchService` y `FileService`; cargar el árbol de ficheros con `FileService.getTree()` cuando `isOpen` cambia a `true` (usando `effect` o `toObservable`)
- [x] 2.3 Añadir `@HostListener('document:keydown.control.p', ['$event'])` en el componente que llame a `GlobalSearchService.open()` y haga `event.preventDefault()`; ignorar el evento si `event.target` está dentro de un elemento con clase `.cm-editor` (CodeMirror)
- [x] 2.4 Implementar señales `searchQuery`, `searchHighlightIndex`, `filteredFiles` y los métodos `onSearchInput`, `onSearchKeyDown` (navegación con flechas + Enter) en el nuevo componente
- [x] 2.5 Al seleccionar un archivo, llamar a `GlobalSearchService.selectFile(path)`

## 3. AppComponent

- [x] 3.1 Importar y añadir `GlobalSearchModalComponent` al template de `AppComponent` (junto al spinner global, fuera del `<router-outlet>`)

## 4. Adaptar ExplorerComponent

- [x] 4.1 Eliminar el `@HostListener('document:keydown.control.p')` de `ExplorerComponent`
- [x] 4.2 Eliminar `showSearch` signal, el método `openSearch()`, y el template del modal de búsqueda de `ExplorerComponent`
- [x] 4.3 Suscribir a `GlobalSearchService.pendingNavigation` en `ngOnInit` de `ExplorerComponent`; cuando emite un path, consumirlo (resetear a null) y ejecutar la lógica de navegación existente (`selectFromSearch` con confirmación de unsaved changes si aplica)
- [x] 4.4 Eliminar el botón de búsqueda de la toolbar del explorer si se abrirá solo via `Ctrl+P`, O redirigirlo a `GlobalSearchService.open()` si se quiere mantener el botón

## 5. Verificación

- [x] 5.1 Verificar que `Ctrl+P` abre el modal desde `/jobs`, `/chat`, `/settings` y `/profile`
- [x] 5.2 Verificar que seleccionar un archivo desde una ruta no-explorer navega a `/explorer/<path>`
- [ ] 5.3 Verificar que desde `/explorer` con cambios sin guardar aparece el diálogo de confirmación al seleccionar un archivo
- [x] 5.4 Verificar que en el editor CodeMirror `Ctrl+P` no abre el modal
- [x] 5.5 Verificar que el modal muestra correctamente la lista filtrada de archivos al escribir en el input

