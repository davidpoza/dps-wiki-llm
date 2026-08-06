import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { NgClass } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { DialogModule } from 'primeng/dialog';
import { SyncService } from '../services/sync.service';
import { Conflict } from '../types';
import { ConflictMergeEditorComponent } from './conflict-merge-editor.component';

/**
 * App-scoped conflict-resolution surface: the side-by-side conflict dialog plus the three-pane
 * manual merge editor. Mounted once at the app root and driven entirely by {@link SyncService}, so
 * conflicts reported by a sync started from any screen are resolvable in place. Behavior is
 * unchanged from the previous inline version in `GitHistoryComponent`.
 */
@Component({
  selector: 'app-conflict-resolver',
  standalone: true,
  imports: [NgClass, TranslocoPipe, DialogModule, ConflictMergeEditorComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      [(visible)]="sync.showConflicts"
      [modal]="true"
      [draggable]="false"
      [style]="{ width: '90vw', maxWidth: '1100px' }"
    >
      <ng-template pTemplate="header">
        <div class="conflicts-dialog-header">
          <span>{{ 'sync.conflictsHeader' | transloco }}</span>
          <span class="resolved-counter">{{
            'sync.resolvedCounter' | transloco: { resolved: sync.resolvedCount(), total: sync.totalConflicts() }
          }}</span>
        </div>
      </ng-template>

      @if (sync.conflicts().length === 0) {
        <p class="empty">{{ 'sync.noConflicts' | transloco }}</p>
      }

      @if (sync.conflicts().length > 0) {
        <div class="bulk-bar">
          <button class="bulk-btn" (click)="sync.resolveAll('LOCAL')">{{ 'sync.applyAllLocal' | transloco }}</button>
          <button class="bulk-btn" (click)="sync.resolveAll('REMOTE')">{{ 'sync.applyAllRemote' | transloco }}</button>
        </div>
      }

      @for (conflict of sync.conflicts(); track conflict.path) {
        <div class="conflict">
          <div class="conflict-row" (click)="sync.toggleExpand(conflict.path)">
            <i
              class="pi"
              [ngClass]="sync.expandedConflicts().has(conflict.path) ? 'pi-chevron-down' : 'pi-chevron-right'"
            ></i>
            <span class="conflict-path">{{ conflict.path }}</span>
            <div class="conflict-actions" (click)="$event.stopPropagation()">
              <button class="keep-btn" (click)="sync.resolve(conflict.path, 'LOCAL')">
                {{ 'sync.localVersion' | transloco }}
              </button>
              <button class="keep-btn" (click)="sync.resolve(conflict.path, 'REMOTE')">
                {{ 'sync.remoteVersion' | transloco }}
              </button>
              <button
                class="skip-btn"
                [title]="'sync.skipTooltip' | transloco"
                (click)="sync.resolve(conflict.path, 'SKIP')"
              >
                {{ 'sync.skipConflict' | transloco }}
              </button>
              <button class="manual-btn" (click)="sync.openMergeEditor(conflict)">
                {{ 'sync.manualResolve' | transloco }}
              </button>
            </div>
          </div>

          @if (sync.expandedConflicts().has(conflict.path)) {
            <div class="conflict-panes">
              <div class="conflict-pane">
                <div class="pane-header">
                  <span>{{ 'sync.localVersion' | transloco }}</span>
                </div>
                <pre class="pane-body">@for (line of splitLines(conflict.localContent); track $index) {
<span [ngClass]="conflictLineClass(conflict, $index, 'local')">{{ line }}</span>
}</pre>
              </div>
              <div class="conflict-pane">
                <div class="pane-header">
                  <span>{{ 'sync.remoteVersion' | transloco }}</span>
                </div>
                <pre class="pane-body">@for (line of splitLines(conflict.remoteContent); track $index) {
<span [ngClass]="conflictLineClass(conflict, $index, 'remote')">{{ line }}</span>
}</pre>
              </div>
            </div>
          }
        </div>
      }
    </p-dialog>

    @if (sync.activeManualConflict()) {
      <app-conflict-merge-editor
        [conflict]="sync.activeManualConflict()!"
        (resolved)="sync.onManualResolved(sync.activeManualConflict()!.path, $event)"
        (cancelled)="sync.cancelMergeEditor()"
      />
    }
  `,
  styles: [
    `
      .empty {
        color: var(--app-text-muted);
      }
      .conflicts-dialog-header {
        display: flex;
        align-items: center;
        gap: 1rem;
        width: 100%;
      }
      .resolved-counter {
        font-size: 0.8rem;
        font-weight: 400;
        color: var(--app-text-muted);
      }
      .bulk-bar {
        display: flex;
        gap: 0.5rem;
        margin-bottom: 0.75rem;
        padding-bottom: 0.75rem;
        border-bottom: 1px solid var(--app-border);
      }
      .bulk-btn {
        padding: 0.25rem 0.75rem;
        font-size: 0.8rem;
        cursor: pointer;
        border: 1px solid var(--app-border-strong);
        border-radius: 4px;
        background: var(--app-surface-muted);
        color: var(--app-text);
      }
      .bulk-btn:hover {
        background: var(--app-surface-subtle);
      }
      .conflict {
        margin-bottom: 0.5rem;
        border: 1px solid var(--app-border);
        border-radius: 6px;
        overflow: hidden;
      }
      .conflict-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.45rem 0.6rem;
        background: var(--app-surface-muted);
        cursor: pointer;
        user-select: none;
      }
      .conflict-row:hover {
        background: var(--app-surface-subtle);
      }
      .conflict-row .pi {
        font-size: 0.75rem;
        color: var(--app-text-muted);
        flex-shrink: 0;
      }
      .conflict-path {
        font-family: monospace;
        font-size: 0.8rem;
        font-weight: 600;
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .conflict-actions {
        display: flex;
        gap: 0.35rem;
        flex-shrink: 0;
      }
      .conflict-panes {
        display: flex;
        gap: 0;
        border-top: 1px solid var(--app-border);
      }
      .conflict-pane {
        flex: 1;
        min-width: 0;
        overflow: hidden;
      }
      .conflict-pane:first-child {
        border-right: 1px solid var(--app-border);
      }
      .pane-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.4rem 0.6rem;
        background: var(--app-surface-subtle);
        font-size: 0.8rem;
        font-weight: 600;
      }
      .keep-btn {
        padding: 0.15rem 0.5rem;
        font-size: 0.72rem;
        cursor: pointer;
        border: 1px solid var(--app-primary);
        border-radius: 4px;
        background: var(--app-primary);
        color: #fff;
      }
      .skip-btn {
        padding: 0.15rem 0.5rem;
        font-size: 0.72rem;
        cursor: pointer;
        border: 1px solid var(--app-border-strong);
        border-radius: 4px;
        background: var(--app-surface-muted);
        color: var(--app-text-muted);
      }
      .skip-btn:hover {
        background: var(--app-surface-subtle);
      }
      .manual-btn {
        padding: 0.15rem 0.5rem;
        font-size: 0.72rem;
        cursor: pointer;
        border: 1px solid var(--app-warning, #f59e0b);
        border-radius: 4px;
        background: transparent;
        color: var(--app-warning, #f59e0b);
      }
      .manual-btn:hover {
        background: color-mix(in srgb, var(--app-warning, #f59e0b) 12%, transparent);
      }
      .pane-body {
        margin: 0;
        font-size: 0.75rem;
        line-height: 1.45;
        background: #1e1e1e;
        color: #d4d4d4;
        border-radius: 0;
        padding: 0.5rem;
        max-width: 100%;
        max-height: 40vh;
        overflow-x: auto;
        white-space: pre;
      }
      .pane-body span {
        display: block;
        white-space: pre;
      }
      .line-changed {
        background: #3a2f1a;
        color: #ffd58a;
      }
      @media (max-width: 600px) {
        .conflict-row {
          flex-wrap: wrap;
        }
        .conflict-actions {
          flex-wrap: wrap;
        }
        .conflict-panes {
          flex-direction: column;
        }
        .conflict-pane:first-child {
          border-right: none;
          border-bottom: 1px solid var(--app-border);
        }
        .pane-body {
          font-size: 0.68rem;
          padding: 0.4rem;
        }
      }
    `,
  ],
})
export class ConflictResolverComponent {
  readonly sync = inject(SyncService);

  splitLines(content: string): string[] {
    return (content ?? '').split('\n');
  }

  conflictLineClass(conflict: Conflict, index: number, side: 'local' | 'remote'): string {
    const local = this.splitLines(conflict.localContent);
    const remote = this.splitLines(conflict.remoteContent);
    const own = side === 'local' ? local : remote;
    const other = side === 'local' ? remote : local;
    if (index >= own.length) return '';
    return own[index] !== (other[index] ?? undefined) ? 'line-changed' : '';
  }
}
