import { ChangeDetectionStrategy, Component, computed, effect, inject, OnDestroy } from '@angular/core';
import { NgClass } from '@angular/common';
import { TranslocoPipe } from '@jsverse/transloco';
import { SyncService } from '../services/sync.service';

const SUCCESS_DISMISS_MS = 4000;

/**
 * App-scoped toast that reports the state of a WebDAV sync started from anywhere. While a sync runs
 * it shows a determinate progress bar and the file currently being scanned (both derived from the
 * shared {@link SyncService}); on completion it collapses to a success summary that auto-dismisses,
 * or an error that stays until dismissed.
 */
@Component({
  selector: 'app-sync-status-toast',
  standalone: true,
  imports: [NgClass, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (sync.syncing() || sync.result(); as _shown) {
      <div class="sync-toast" [class.error]="isError()" [class.success]="isSuccess()">
        @if (sync.syncing()) {
          <div class="toast-row">
            <i class="pi pi-sync pi-spin"></i>
            <span class="toast-label">{{ 'sync.running' | transloco }}</span>
            <span class="toast-pct">{{ percent() }}%</span>
          </div>
          <div class="bar-wrap">
            <div class="bar" [style.width.%]="percent()"></div>
          </div>
          @if (path()) {
            <div class="toast-file" [title]="path()">{{ path() }}</div>
          }
        } @else if (sync.result(); as r) {
          <div class="toast-row">
            <i class="pi" [ngClass]="r.ok ? 'pi-check-circle' : 'pi-exclamation-triangle'"></i>
            <span class="toast-label">{{ r.message }}</span>
            <button
              class="toast-close"
              type="button"
              [attr.aria-label]="'sync.dismiss' | transloco"
              (click)="sync.dismissResult()"
            >
              <i class="pi pi-times"></i>
            </button>
          </div>
        }
      </div>
    }
  `,
  styles: [
    `
      .sync-toast {
        position: fixed;
        right: 16px;
        bottom: 16px;
        z-index: 1200;
        width: min(360px, calc(100vw - 32px));
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        padding: 0.7rem 0.85rem;
        background: var(--app-surface);
        color: var(--app-text);
        border: 1px solid var(--app-border-strong);
        border-left: 3px solid var(--app-primary);
        border-radius: 8px;
        box-shadow: var(--app-shadow);
        font-size: 0.85rem;
      }
      .sync-toast.success {
        border-left-color: #16a34a;
      }
      .sync-toast.error {
        border-left-color: var(--app-error-text);
      }
      .toast-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
      }
      .toast-row .pi {
        font-size: 0.95rem;
        flex-shrink: 0;
      }
      .sync-toast.success .pi-check-circle {
        color: #16a34a;
      }
      .sync-toast.error .pi-exclamation-triangle {
        color: var(--app-error-text);
      }
      .toast-label {
        flex: 1;
        min-width: 0;
        line-height: 1.3;
      }
      .toast-pct {
        font-variant-numeric: tabular-nums;
        font-weight: 600;
        color: var(--app-text-muted);
        flex-shrink: 0;
      }
      .toast-close {
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 24px;
        height: 24px;
        padding: 0;
        border: none;
        border-radius: 4px;
        background: transparent;
        color: var(--app-text-muted);
        cursor: pointer;
      }
      .toast-close:hover {
        background: var(--app-surface-muted);
        color: var(--app-text);
      }
      .bar-wrap {
        position: relative;
        height: 6px;
        background: var(--app-border);
        border-radius: 3px;
        overflow: hidden;
      }
      .bar {
        height: 100%;
        background: var(--app-primary);
        border-radius: 3px;
        transition: width 0.2s ease;
      }
      .toast-file {
        font-family: monospace;
        font-size: 0.72rem;
        color: var(--app-text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    `,
  ],
})
export class SyncStatusToastComponent implements OnDestroy {
  readonly sync = inject(SyncService);

  readonly percent = computed(() => this.sync.progress()?.percent ?? 0);
  readonly path = computed(() => this.sync.progress()?.path ?? null);
  readonly isError = computed(() => {
    const r = this.sync.result();
    return !!r && !r.ok;
  });
  readonly isSuccess = computed(() => {
    const r = this.sync.result();
    return !!r && r.ok;
  });

  private dismissTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // Auto-dismiss a successful result after a short delay; errors persist until dismissed.
    effect(() => {
      const r = this.sync.result();
      if (this.dismissTimer) {
        clearTimeout(this.dismissTimer);
        this.dismissTimer = undefined;
      }
      if (r && r.ok) {
        this.dismissTimer = setTimeout(() => this.sync.dismissResult(), SUCCESS_DISMISS_MS);
      }
    });
  }

  ngOnDestroy(): void {
    if (this.dismissTimer) clearTimeout(this.dismissTimer);
  }
}
