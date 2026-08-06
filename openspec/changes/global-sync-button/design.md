## Context

WebDAV sync is currently owned entirely by `GitHistoryComponent` (the `/git` route):

- The sync button calls `api.enqueueSync()` → `{ jobId }`, stores `pendingSyncJobId`, and an `effect()` watches `JobsStore.jobs()` for that job's terminal state.
- On completion it parses the job result message, calls `api.getConflicts()`, and drives an inline conflict `p-dialog` plus the reusable `<app-conflict-merge-editor>`.
- All sync/conflict signals (`syncing`, `syncMessage`, `conflicts`, `showConflicts`, `activeManualConflict`, …) live in that one component, so nothing works off the `/git` route.

Two pieces of infrastructure already exist and make a global control cheap:

- **`JobsStore`** (root-provided, SSE-backed, connected once in `HomeComponent.ngOnInit`) already receives the sync job's `sync-scan` progress events and converts them into `job.currentActivity = { label, path, percent }`. Real-time progress data for the sync job is therefore already in a global signal.
- **App-scoped overlay precedent**: `AppComponent` already mounts `<app-global-search-modal>` (driven by the root `GlobalSearchService`, signal-based) and a global spinner overlay. The same pattern fits a global sync toast and a global conflict dialog.

The backend needs no changes: `POST /api/webdav/sync`, `sync-scan` progress events, `GET /api/webdav/conflicts`, and `POST /api/webdav/conflicts/resolve` are all in place.

## Goals / Non-Goals

**Goals:**

- Start a WebDAV sync from any authenticated screen via a nav-bar icon.
- Show live progress (percent + current file) during the sync, then a terminal success/error summary, as a toast.
- Auto-open the *existing* conflict-resolution dialog when a sync reports conflicts, from wherever the user is.
- One single source of truth for sync + conflict state, shared by the global control and the Changes page — no duplicated state, no risk of two syncs or two dialogs.

**Non-Goals:**

- No backend or WebDAV endpoint changes.
- No change to conflict-resolution *behavior* (collapsed list, bulk, skip, three-pane merge editor stay exactly as specified by `conflict-resolution-options`).
- No general-purpose notification/toast framework — just the minimal host needed for sync feedback.
- No auto-sync / scheduled sync; the trigger stays user-initiated.

## Decisions

### Decision 1: Extract a root `SyncService` as the single source of truth

Move all sync-orchestration state out of `GitHistoryComponent` into a root-provided `SyncService`:

- Signals: `syncing`, `progress` (`{ percent, path } | null`), `result` (terminal summary or error), `conflicts`, `showConflicts`, `activeManualConflict`.
- `startSync()`: no-op if `syncing()` is already true (single-flight); else `api.enqueueSync()` and record `pendingSyncJobId`.
- An internal `effect()` (identical logic to today's `GitHistoryComponent` effect) watches `JobsStore.jobs().get(pendingSyncJobId)` for `currentActivity` (→ `progress`) and for terminal status (→ load conflicts / set result).
- `resolve()`, `resolveAll()`, `openMergeEditor()`, `onManualResolved()` move here too.

**Why:** the requirement "same sync engine as the Changes page … never more than one active sync or one dialog" is only guaranteeable if both entry points share one owner. A root service is the natural single owner and mirrors the existing `GlobalSearchService`/`JobsStore` pattern.

**Alternative considered:** keep state in `GitHistoryComponent` and have the nav "reach into" it. Rejected — `GitHistoryComponent` is only instantiated on `/git`, so it cannot be the owner for a global control.

### Decision 2: Depend on `JobsStore` for progress, but ensure it is connected app-wide

Progress is read from `JobsStore.jobs().get(jobId)?.currentActivity`. Today `JobsStore.connect()` is called in `HomeComponent.ngOnInit`, which covers all authenticated screens that render through `HomeComponent`/nav. `SyncService` SHALL call `JobsStore.connect()` (idempotent — it early-returns if already connected) before/when starting a sync, so progress works even on any screen that might not have triggered the connection yet.

**Why:** reuses the one SSE stream (the spec requires deriving progress from the shared store, "not a separate connection"). `connect()` is already guarded against double-open.

### Decision 3: Two app-root components — a toast host and a shared conflict resolver

Add to `AppComponent`'s template, next to `<app-global-search-modal />`:

- `<app-sync-status-toast />` — reads `SyncService.syncing`/`progress`/`result` and renders a fixed-position toast (custom component in the style of the existing global spinner overlay, using `--app-*` theme vars). Live state shows a determinate progress bar + current file; terminal success auto-dismisses after ~4s; error stays until dismissed.
- `<app-conflict-resolver />` — the conflict `p-dialog` + `<app-conflict-merge-editor>` markup moved verbatim out of `GitHistoryComponent`, now bound to `SyncService` signals.

**Why a custom toast over PrimeNG `Toast`/`MessageService`:** PrimeNG toasts are fire-and-forget messages; this toast must *live-update* its progress from a signal for the duration of the job. A tiny signal-bound component is simpler and matches the app's existing custom-overlay approach. PrimeNG stays used where it already is (`p-dialog`, merge editor).

### Decision 4: `GitHistoryComponent` becomes a thin consumer

`GitHistoryComponent` keeps its "Sync" button but calls `sync.startSync()`, and deletes its local sync/conflict state, effect, and the conflict dialog markup (now provided globally). Its history reload on sync completion is preserved by subscribing to the shared `result`/completion signal (e.g. an `effect` that calls `load()` when a sync completes). The `git-history` and `conflict-resolution-options` behaviors are unchanged from the user's perspective.

**Why:** avoids two dialogs/two effects racing on the same job, satisfying the single-source-of-truth scenarios.

### Decision 5: Nav icon placement and state

Add a `<button class="nav-sync">` with a `pi pi-sync` icon in `NavComponent`, positioned in the top-right region. Because the existing `.nav-profile` uses `margin-left:auto` to pin right, the sync button is placed so it sits at the far right on desktop and remains reachable in the mobile layout. Bind `[disabled]="sync.syncing()"` and add a spinning class (`pi-spin`) while `sync.syncing()` is true. It is an action `<button>`, not a `routerLink`, so it never participates in `routerLinkActive` highlighting.

## Risks / Trade-offs

- **`JobsStore` not connected on some entry screen** → `SyncService.startSync()` calls the idempotent `JobsStore.connect()` so progress events are always received.
- **Two components (`GitHistory` + global toast) reacting to the same completion** → resolved by Decision 4: only the shared service owns terminal handling; `GitHistory` merely reloads its list.
- **`currentActivity` is cleared 1.5s after terminal state by `JobsStore`** → the terminal *summary* comes from the completed job's `result` message (as today), not from `currentActivity`, so clearing progress does not blank the success toast.
- **Nav bar horizontal space on mobile** → the sync icon is icon-only (no label) and small; verify it does not crowd the hamburger toggle at ≤768px.
- **Regression risk in the `/git` refactor** → the conflict dialog and merge editor markup are moved verbatim; only their host component and the signals they bind to change, keeping `conflict-resolution-options` behavior intact.

## Migration Plan

Pure frontend, no data migration. Rollout order:

1. Add `SyncService` and move orchestration logic into it (behavior-preserving).
2. Add `ConflictResolverComponent` (moved markup) and `SyncStatusToastComponent`; mount both in `AppComponent`.
3. Refactor `GitHistoryComponent` to delegate to `SyncService` and drop its local dialog.
4. Add the nav-bar sync icon.
5. Add `sync.*` toast i18n strings (es/en).

Rollback: revert the frontend change; no backend or schema impact.

## Open Questions

- Should the terminal success toast surface the pulled/pushed/deleted counts inline, or just "Sync completado"? (Design leans toward showing counts, reusing the existing completion message.)
- Desktop placement: sync icon to the left of the profile chip vs. far-right edge — a visual detail to settle during implementation.
