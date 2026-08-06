## 1. SyncService — single source of truth

- [x] 1.1 Create `frontend/src/app/services/sync.service.ts` (root-provided) with signals `syncing`, `progress` (`{ percent: number; path?: string } | null`), `result` (`{ ok: boolean; message: string } | null`), `conflicts`, `showConflicts`, `activeManualConflict`
- [x] 1.2 Implement `startSync()`: no-op when `syncing()` is already true (single-flight); otherwise call `JobsStore.connect()` (idempotent), `api.enqueueSync()`, store `pendingSyncJobId`, and set `syncing`
- [x] 1.3 Add an internal `effect()` watching `JobsStore.jobs().get(pendingSyncJobId)`: map `currentActivity` → `progress`; on `COMPLETED` parse the job result message → set success `result`, then load conflicts; on `FAILED` set error `result` and clear `syncing`
- [x] 1.4 Move `loadConflicts()`, `resolve()`, `resolveAll()`, `openMergeEditor()`, `onManualResolved()` from `GitHistoryComponent` into `SyncService`, wired to `api.getConflicts()` / `api.resolveConflict()`
- [x] 1.5 Ensure terminal summary comes from the completed job's `result` message (not `currentActivity`, which `JobsStore` clears ~1.5s after terminal state)

## 2. Shared conflict resolver component

- [x] 2.1 Create `frontend/src/app/components/conflict-resolver.component.ts` and move the conflict `p-dialog` markup (collapsed rows, resolved counter, bulk bar, expand/collapse panes) plus `<app-conflict-merge-editor>` verbatim out of `GitHistoryComponent`
- [x] 2.2 Bind the component to `SyncService` signals/methods (`conflicts`, `showConflicts`, `resolvedCount`, `expandedConflicts`, `activeManualConflict`, `resolve`, `resolveAll`, `toggleExpand`, `openMergeEditor`, `onManualResolved`) — no behavior changes
- [x] 2.3 Keep the existing `conflict-resolution-options` behavior identical (LOCAL/REMOTE/SKIP/MANUAL, bulk, counter, three-pane editor)

## 3. Sync status toast component

- [x] 3.1 Create `frontend/src/app/components/sync-status-toast.component.ts` (fixed-position overlay in the style of the global spinner, using `--app-*` theme vars)
- [x] 3.2 While `syncing()` show a determinate progress bar (`progress().percent`) and the current file (`progress().path`) with a "sincronizando" label
- [x] 3.3 On terminal `result`: show success summary (pulled/pushed/deleted/conflicts counts) auto-dismissing after ~4s; show error state (incl. "WebDAV not configured") that stays until dismissed
- [x] 3.4 Add a manual close/dismiss control that clears `result`

## 4. Mount globally in app root

- [x] 4.1 Add `<app-sync-status-toast />` and `<app-conflict-resolver />` to `AppComponent`'s template alongside `<app-global-search-modal />`, and add them to `imports`

## 5. Navigation-bar sync icon

- [x] 5.1 In `NavComponent`, inject `SyncService` and add a top-right `<button class="nav-sync">` with a `pi pi-sync` icon that calls `sync.startSync()`
- [x] 5.2 Bind `[disabled]="sync.syncing()"` and add a spinning state (`pi-spin`) while syncing; keep it an action button (no `routerLink`, no `routerLinkActive`)
- [x] 5.3 Add styles so the icon sits in the top-right region on desktop and stays reachable in the ≤768px mobile layout without crowding the hamburger toggle
- [x] 5.4 Add an `aria-label` (transloco) for the sync action

## 6. Refactor GitHistoryComponent to consume the service

- [x] 6.1 Replace the local `sync()` with `sync.startSync()`; delete local sync/conflict signals, the sync effect, and the conflict `p-dialog` + merge-editor markup (now global)
- [x] 6.2 Reload history when a sync completes (effect on the shared completion/`result` signal calling `load()`)
- [x] 6.3 Keep the page's sync button/message display working via the shared `SyncService` state

## 7. i18n

- [x] 7.1 Add `sync.*` toast strings (running, progress, success-with-counts, error, webdavNotConfigured, dismiss) to the Transloco `es` message file
- [x] 7.2 Mirror the same keys in the `en` message file
- [x] 7.3 Add the nav sync action `aria-label` key in both locales

## 8. Verification

- [x] 8.1 Update/adjust affected unit specs (e.g. `git-history` sync/conflict expectations moved to `SyncService`/`ConflictResolverComponent`) — no unit spec exercises the refactored components, so none needed changes; existing suite (12 tests) stays green
- [x] 8.2 `npm run lint` and `npm test` (frontend) pass — `npm test` 12/12 pass and AOT `ng build` is clean; changed files are lint-clean (0 errors), the only remaining `npm run lint` errors are pre-existing and in untouched files
- [ ] 8.3 Manual check: trigger sync from Explorer/Chat/Ingest → live progress toast updates; a conflicting sync auto-opens the conflict dialog; success toast shows counts and auto-dismisses; single-flight prevents a second concurrent sync
