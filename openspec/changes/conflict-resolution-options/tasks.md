## 1. Backend — API extension

- [x] 1.1 Add optional `content` field to `ConflictResolveRequest` record (`String content`)
- [x] 1.2 Add `SKIP` branch in `WebDavSyncService.resolveConflict`: clear `conflict` flag and `remoteContent`, no file or WebDAV changes, no snapshot
- [x] 1.3 Add `MANUAL` branch in `WebDavSyncService.resolveConflict`: validate `content` non-blank (throw `IllegalArgumentException` if blank), write to local vault, push to WebDAV, record snapshot (source `WEBDAV_PULL`), update baseline
- [x] 1.4 Update `WebDavController.resolve` to pass `request.content()` to `resolveConflict` and map blank-content `IllegalArgumentException` to HTTP 400

## 2. Frontend — i18n keys

- [x] 2.1 Add keys to `es.json`: `sync.resolvedCounter`, `sync.applyAllLocal`, `sync.applyAllRemote`, `sync.skipConflict`, `sync.skipTooltip`, `sync.manualResolve`, `sync.takeLocal`, `sync.takeRemote`, `sync.submitManual`, `sync.cancelManual`, `sync.bulkError`
- [x] 2.2 Add same keys to `en.json`

## 3. Frontend — API service

- [x] 3.1 Update `ApiService.resolveConflict` signature to `resolveConflict(path: string, keep: 'LOCAL' | 'REMOTE' | 'SKIP' | 'MANUAL', content?: string)` and include `content` in the request body when present

## 4. Frontend — `ConflictMergeEditorComponent`

- [x] 4.1 Create `frontend/src/app/components/conflict-merge-editor.component.ts` as a standalone Angular component
- [x] 4.2 Declare `@Input() conflict!: Conflict` and `@Output() resolved = new EventEmitter<string>()` and `@Output() cancelled = new EventEmitter<void>()`
- [x] 4.3 Template: full-screen `p-dialog` (95 vw × 90 vh) with three panes — local (`<pre>`, read-only, top-left), remote (`<pre>`, read-only, top-right), result (`<textarea>`, editable, full-width bottom)
- [x] 4.4 Add "Tomar local completo" and "Tomar remoto completo" buttons that set the result `<textarea>` value to the respective pane content
- [x] 4.5 "Resolver" button emits `resolved` with the textarea content; "Cancelar" emits `cancelled`; apply existing `conflictLineClass` diff-highlight logic to the two read-only panes
- [x] 4.6 Style with `--app-*` CSS variables; panes use `overflow-y: auto`; result pane gets `flex: 1; min-height: 200px`

## 5. Frontend — Conflict dialog list (git-history.component.ts)

- [x] 5.1 Add `readonly totalConflicts = signal(0)` set once when `loadConflicts()` returns; add `resolved = computed(() => totalConflicts() - conflicts().length)`; show "{{ resolved() }} / {{ totalConflicts() }} resueltos" in the dialog header
- [x] 5.2 Add `readonly expandedConflicts = signal<Set<string>>(new Set())` and `toggleExpand(path)` method; conflict diff panes render only when `expandedConflicts().has(conflict.path)`
- [x] 5.3 Make the conflict path row a clickable element calling `toggleExpand(conflict.path)`; add a chevron icon indicating expanded/collapsed state
- [x] 5.4 Add bulk-action bar at the top of the conflict list: "Aplicar versión local a todos" / "Aplicar versión remota a todos" buttons, hidden when `conflicts().length === 0`
- [x] 5.5 Implement `resolveAll(keep: 'LOCAL' | 'REMOTE')`: iterate conflicts sequentially, call `resolve()` for each, collect errors, show error summary via `syncMessage` if any fail
- [x] 5.6 Add "No resolver" button to each conflict's action row; wire to `resolve(conflict.path, 'SKIP')`
- [x] 5.7 Add "Resolución manual" button to each conflict's action row; clicking sets `activeManualConflict` signal to that conflict, opening the `ConflictMergeEditorComponent`
- [x] 5.8 Handle `(resolved)` event from `ConflictMergeEditorComponent`: call `resolve(conflict.path, 'MANUAL', content)` and clear `activeManualConflict`; handle `(cancelled)`: clear `activeManualConflict`
- [x] 5.9 Import and declare `ConflictMergeEditorComponent` in the component's `imports` array
