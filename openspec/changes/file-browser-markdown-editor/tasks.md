## 1. Backend: FileController y FileService

- [x] 1.1 Crear `FileService.java` con método `getTree()` que recorra el vault con `Files.walkFileTree` y devuelva `List<TreeNodeDto>` jerárquico (solo ficheros `.md`)
- [x] 1.2 Añadir validación de path traversal en `FileService`: el path resuelto debe estar dentro de `vault-path`
- [x] 1.3 Añadir método `getContent(String relativePath)` en `FileService` que lea el contenido del fichero como String
- [x] 1.4 Añadir método `saveContent(String relativePath, String content)` en `FileService` que escriba el contenido al fichero
- [x] 1.5 Crear `TreeNodeDto.java` con campos: `key`, `label`, `data` (relative path), `icon`, `children`, `leaf`
- [x] 1.6 Crear `FileController.java` con `@RestController @RequestMapping("/api/files")` y endpoints:
  - `GET /tree` → `fileService.getTree()`
  - `GET /content?path=` → `fileService.getContent(path)`
  - `PUT /content?path=` + body → `fileService.saveContent(path, body)`
- [x] 1.7 Asegurar que `/api/files/**` está protegido por JWT en `SecurityConfig` (mismo patrón que `/api/jobs/**`)

## 2. Frontend: FileService Angular

- [x] 2.1 Crear `file.service.ts` con métodos:
  - `getTree(): Observable<TreeNode[]>`
  - `getContent(path: string): Observable<string>`
  - `saveContent(path: string, content: string): Observable<void>`
- [x] 2.2 Añadir los endpoints al `api.service.ts` o llamarlos directamente vía `HttpClient` con el interceptor JWT ya configurado

## 3. Frontend: Instalar Milkdown

- [x] 3.1 Instalar dependencias: `npm install @milkdown/core @milkdown/preset-commonmark @milkdown/ctx @milkdown/transformer`
- [x] 3.2 Verificar compatibilidad de versiones con Angular 17+ y que no haya conflictos de peer deps

## 4. Frontend: ExplorerComponent

- [x] 4.1 Crear `explorer.component.ts` con layout split-pane: árbol a la izquierda (30%), editor a la derecha (70%)
- [x] 4.2 Integrar `p-tree` de PrimeNG enlazado al Observable de `fileService.getTree()`
- [x] 4.3 Manejar evento `(onNodeSelect)` del `p-tree`: cargar contenido del fichero seleccionado en el editor
- [x] 4.4 Integrar Milkdown en el componente vía `afterViewInit` con `Editor.make().config(...).use(commonmark).create()`
- [x] 4.5 Implementar carga de contenido en Milkdown al seleccionar fichero (usar `commandsCtx` o `replaceAll`)
- [x] 4.6 Añadir indicador de cambios pendientes (flag `isDirty`): activar al detectar cambio en el editor, mostrar `*` en el título
- [x] 4.7 Implementar botón "Guardar" que llame a `fileService.saveContent()` y muestre toast PrimeNG (`MessageService`)
- [x] 4.8 Implementar shortcut `Ctrl+S` con `@HostListener('document:keydown.control.s')` que dispare el guardado
- [x] 4.9 Implementar diálogo de confirmación (PrimeNG `ConfirmDialog`) al cambiar de fichero con `isDirty === true`
- [x] 4.10 Mostrar mensaje placeholder cuando ningún fichero está seleccionado

## 5. Frontend: Routing e integración

- [x] 5.1 Añadir ruta `{ path: 'explorer', component: ExplorerComponent, canActivate: [authGuard] }` en el router Angular
- [x] 5.2 Añadir enlace "Explorer" en la navegación principal (sidebar o navbar existente)
- [x] 5.3 Importar `TreeModule`, `ConfirmDialogModule`, `ToastModule` de PrimeNG en el módulo o standalone imports del componente

## 6. Verificación

- [ ] 6.1 Verificar que `GET /api/files/tree` responde con el árbol jerárquico y requiere JWT
- [ ] 6.2 Verificar que `GET /api/files/content?path=../../../etc/passwd` retorna HTTP 400
- [ ] 6.3 Verificar flujo completo: navegar a `/explorer`, seleccionar fichero, editar, guardar, recargar y ver cambio persistido
- [ ] 6.4 Verificar que navegar a `/explorer` sin autenticación redirige a `/login`
- [ ] 6.5 Verificar diálogo de confirmación al cambiar de fichero con cambios sin guardar

