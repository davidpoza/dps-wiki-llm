## Context

The current conflict resolution dialog (`git-history.component.ts`) shows each unresolved WebDAV conflict with local and remote panes and a "Conservar esta versión" button for each side. The backend `POST /api/webdav/conflicts/resolve` accepts `{ path, keep: "LOCAL" | "REMOTE" }`.

Users with many conflicts need: a scannable list (collapsed by default, expand only the one they care about), a live count of how many are resolved vs total, bulk actions, a way to dismiss a conflict without committing to either side, and the ability to produce a custom merged document in a proper editor.

## Goals / Non-Goals

**Goals:**
- Collapsed-by-default conflict list with expand-on-demand diff panes.
- Resolved-counter in the dialog header ("X / N resueltos").
- Bulk resolve all conflicts with local or remote content in one click.
- Skip a conflict (clear the conflict flag without touching files or WebDAV).
- Manual resolution via a dedicated VS Code-style three-pane merge editor (local | remote | result).

**Non-Goals:**
- Line-level or hunk-level merge controls (accept only specific diff hunks).
- Conflict-resolution history or audit log beyond the existing snapshot mechanism.

## Decisions

### Extend `keep` to `"SKIP" | "MANUAL"` instead of a separate endpoint

Adding `"SKIP"` and `"MANUAL"` to the existing `keep` discriminator keeps the API surface minimal and consistent. `MANUAL` requires an additional `content` field. The record `ConflictResolveRequest(String path, String keep, String content)` models this cleanly (Java records allow adding an optional field; the controller validates `content != null` only when `keep == "MANUAL"`).

Alternative considered: separate `POST /api/webdav/conflicts/skip` endpoint — rejected because it splits logic unnecessarily and requires more frontend wiring.

### `SKIP` clears the conflict flag without writing files

A skipped conflict means: "I know about this, I'll deal with it outside the app." The baseline's `conflict` flag is set to `false`, `remoteContent` is cleared, and no snapshot is created. The file on disk and on WebDAV are untouched. The next sync will re-evaluate the file and may re-raise a conflict if both sides still differ.

Alternative considered: keep the conflict in DB but hide it in the UI with a client-side flag — rejected because state would be lost on page reload.

### `MANUAL` writes to disk, pushes to WebDAV, creates a snapshot

Manual resolution content replaces the local file, gets pushed to WebDAV, and a snapshot is recorded (source `WEBDAV_PULL`, consistent with remote-resolution behavior) so it appears in history. The baseline is updated to the sha256 of the manual content.

### Conflict entries are collapsed by default

Each row in the conflict list shows the path and action buttons. Clicking anywhere on the path row toggles the diff panes. A `Set<string>` signal tracks expanded paths. This keeps the list scannable when there are many conflicts.

### Resolved counter in dialog header

The dialog subheader shows "X / N resueltos". `N` is the initial total captured when the dialog opens (a separate `readonly totalConflicts = signal(0)` set once when `loadConflicts()` returns). `X = N - conflicts().length`. This gives immediate feedback after each resolution without reloading.

### Dedicated `ConflictMergeEditorComponent` for manual resolution

A new standalone Angular component opens as a full-screen `p-dialog` (95 vw × 90 vh) with three panes:
- **Top-left** (`local-pane`): read-only `<pre>` of local content with existing diff highlighting.
- **Top-right** (`remote-pane`): read-only `<pre>` of remote content.
- **Bottom** (`result-pane`): full-width editable `<textarea>` initially empty; two shortcut buttons ("Tomar local completo" / "Tomar remoto completo") pre-fill it with one side's content.

The component receives a `Conflict` `@Input()` and emits an `(resolved)` event carrying the final `string` content. The parent dialog in `git-history.component.ts` owns the submit call to `resolveConflict(..., 'MANUAL', content)`.

Alternative considered: inline textarea below each conflict row — rejected because it's cramped, obscures both panes, and doesn't match the VS Code three-pane model the user expects.

### Bulk actions resolve one-at-a-time sequentially on the frontend

The "Apply all — local/remote" buttons iterate over the `conflicts()` array and call `resolveConflict` for each, collecting results. No new batch endpoint is added — the existing endpoint is called N times. This is simpler and keeps backend logic unchanged.

## Risks / Trade-offs

- **SKIP may re-raise the conflict**: If the user skips and then syncs again, the same file will re-enter conflict. This is intentional but may confuse users. → Mitigation: tooltip/label clarifies "sin cambios, se volverá a detectar en el próximo sync".
- **Bulk resolution is sequential, not atomic**: If one file fails mid-bulk, some conflicts are resolved and some are not. → Mitigation: frontend collects errors and shows a summary; the dialog stays open if any failures occurred.
- **`MANUAL` content is user-supplied**: Validation is limited to non-null/non-blank. No content-type enforcement. → Acceptable for a Markdown vault.

## Migration Plan

Backend and frontend changes are additive. No DB migration needed (`VaultFileSync` table already has `conflict` and `remote_content` columns). Deploying the new backend before the new frontend is safe; the old `keep: "LOCAL"/"REMOTE"` paths are unchanged.
