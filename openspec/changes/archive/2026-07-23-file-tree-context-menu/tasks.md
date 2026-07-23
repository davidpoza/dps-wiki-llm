## 1. Backend — FileService (Java)

- [x] 1.1 Add `deleteFile(String path)` method to `FileService.java` with wiki-root path-traversal guard
- [x] 1.2 Add `renameFile(String path, String newName)` method to `FileService.java` — validates newName has no path separators, guards both source and target paths, throws on name collision
- [x] 1.3 Add `createFile(String path)` method to `FileService.java` — creates an empty file, guards path, throws on existing file or missing parent directory

## 2. Backend — FileController

- [x] 2.1 Add `DELETE /files/content?path=` endpoint — calls `fileService.deleteFile`, returns 200/400/404
- [x] 2.2 Add `POST /files/rename?path=&newName=` endpoint — calls `fileService.renameFile`, returns 200/400/404/409
- [x] 2.3 Add `POST /files/content?path=` endpoint — calls `fileService.createFile`, returns 201/400/409

## 3. Frontend — Angular FileService

- [x] 3.1 Add `deleteFile(path: string): Observable<void>` — calls `DELETE /api/files/content?path=`
- [x] 3.2 Add `renameFile(path: string, newName: string): Observable<void>` — calls `POST /api/files/rename?path=&newName=`
- [x] 3.3 Add `createFile(path: string): Observable<void>` — calls `POST /api/files/content?path=`

## 4. Frontend — Context Menu wiring

- [x] 4.1 Import `ContextMenuModule` from `primeng/contextmenu` and add to `ExplorerComponent` imports array
- [x] 4.2 Add `p-contextMenu` element to the template and a `#cm` template reference variable
- [x] 4.3 Bind the tree to the context menu: add `[contextMenu]="cm"` and `(onContextMenuSelect)="onContextMenuSelect($event)"` to `p-tree`
- [x] 4.4 Add `contextMenuItems = signal<MenuItem[]>([])` to the component and bind `[model]="contextMenuItems()"` on `p-contextMenu`
- [x] 4.5 Implement `onContextMenuSelect(event)` — sets `contextMenuNode` signal to the clicked node and populates `contextMenuItems` based on `node.leaf` (file: Rename + Delete; directory: Create file)

## 5. Frontend — Rename dialog

- [x] 5.1 Add rename dialog state: `showRenameDialog = signal(false)`, `renameValue = signal('')`
- [x] 5.2 Add `p-dialog` for rename to the template with an input pre-populated with the current filename; confirm button calls `confirmRename()`
- [x] 5.3 Implement `confirmRename()` — calls `fileService.renameFile`, on success refreshes tree and updates `selectedPath`/`selectedLabel` if the renamed file is open, on 409 shows error toast

## 6. Frontend — Create file dialog

- [x] 6.1 Add create file dialog state: `showCreateDialog = signal(false)`, `createFileName = signal('')`
- [x] 6.2 Add `p-dialog` for create file to the template with an empty filename input; confirm button calls `confirmCreate()`
- [x] 6.3 Implement `confirmCreate()` — builds the full path from the right-clicked directory node's `data` + the entered filename (appending `.md` if absent), calls `fileService.createFile`, on success refreshes tree and auto-opens the new file, on 409 shows error toast

## 7. Frontend — Delete confirmation

- [x] 7.1 Add `deleteNode()` method — uses the existing `ConfirmationService` to show "¿Eliminar el fichero '<name>'?", on confirm calls `fileService.deleteFile`, on success refreshes tree and resets editor if the deleted file was open

## 8. Tree refresh helper

- [x] 8.1 Extract tree reload into a private `reloadTree()` method (refactor existing `loadTree` to be re-callable without re-subscribing) so all mutation handlers can call it after success
