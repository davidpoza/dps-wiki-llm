import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { DialogModule } from 'primeng/dialog';
import { Conflict } from '../types';

@Component({
  selector: 'app-conflict-merge-editor',
  standalone: true,
  imports: [NgClass, FormsModule, TranslocoPipe, DialogModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      [header]="'sync.mergeEditorTitle' | transloco: { path: conflict.path }"
      [visible]="true"
      [modal]="true"
      [draggable]="false"
      [closable]="false"
      styleClass="merge-dialog"
      [style]="{ width: '95vw', height: '90vh' }"
      [contentStyle]="{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', padding: '0' }"
    >
      <div class="merge-layout">
        <div class="source-panes">
          <div class="source-pane">
            <div class="source-header">
              <span>{{ 'sync.localVersion' | transloco }}</span>
              <button class="take-btn" (click)="takeLocal()">{{ 'sync.takeLocal' | transloco }}</button>
            </div>
            <pre class="source-body">@for (line of localLines(); track $index) {
<span [ngClass]="lineClass($index, 'local')">{{ line }}</span>
}</pre>
          </div>
          <div class="source-pane">
            <div class="source-header">
              <span>{{ 'sync.remoteVersion' | transloco }}</span>
              <button class="take-btn" (click)="takeRemote()">{{ 'sync.takeRemote' | transloco }}</button>
            </div>
            <pre class="source-body">@for (line of remoteLines(); track $index) {
<span [ngClass]="lineClass($index, 'remote')">{{ line }}</span>
}</pre>
          </div>
        </div>
        <div class="result-pane">
          <div class="result-header">
            <span>{{ 'sync.mergeResultTitle' | transloco }}</span>
          </div>
          <textarea
            class="result-body"
            [(ngModel)]="resultContent"
            [placeholder]="'sync.mergeResultPlaceholder' | transloco"
          ></textarea>
        </div>
      </div>

      <ng-template pTemplate="footer">
        <div class="footer-actions">
          <button class="cancel-btn" (click)="cancel()">{{ 'sync.cancelManual' | transloco }}</button>
          <button class="resolve-btn" [disabled]="!resultContent().trim()" (click)="submit()">
            {{ 'sync.submitManual' | transloco }}
          </button>
        </div>
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .merge-layout {
        display: flex;
        flex-direction: column;
        height: 100%;
        overflow: hidden;
      }
      .source-panes {
        display: flex;
        flex: 1;
        min-height: 0;
        gap: 0;
        border-bottom: 2px solid var(--app-border-strong);
      }
      .source-pane {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
        overflow: hidden;
      }
      .source-pane:first-child {
        border-right: 1px solid var(--app-border);
      }
      .source-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.4rem 0.75rem;
        background: var(--app-surface-muted);
        border-bottom: 1px solid var(--app-border);
        font-size: 0.8rem;
        font-weight: 600;
        flex-shrink: 0;
      }
      .source-body {
        flex: 1;
        overflow-y: auto;
        margin: 0;
        padding: 0.5rem 0.75rem;
        font-size: 0.78rem;
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
        background: var(--app-surface);
        color: var(--app-text);
      }
      .result-pane {
        display: flex;
        flex-direction: column;
        flex: 0 0 35%;
        min-height: 0;
      }
      .result-header {
        padding: 0.4rem 0.75rem;
        background: var(--app-surface-muted);
        border-bottom: 1px solid var(--app-border);
        font-size: 0.8rem;
        font-weight: 600;
        flex-shrink: 0;
      }
      .result-body {
        flex: 1;
        resize: none;
        border: none;
        outline: none;
        padding: 0.5rem 0.75rem;
        font-family: monospace;
        font-size: 0.78rem;
        line-height: 1.5;
        background: var(--app-surface);
        color: var(--app-text);
        min-height: 200px;
      }
      .take-btn {
        padding: 0.15rem 0.5rem;
        font-size: 0.75rem;
        cursor: pointer;
        border: 1px solid var(--app-border-strong);
        border-radius: 4px;
        background: var(--app-surface);
        color: var(--app-text);
      }
      .take-btn:hover {
        background: var(--app-primary-soft);
        color: var(--app-primary);
      }
      .footer-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.5rem;
      }
      .cancel-btn {
        padding: 0.35rem 1rem;
        cursor: pointer;
        border: 1px solid var(--app-border-strong);
        border-radius: 4px;
        background: var(--app-surface-muted);
        color: var(--app-text);
      }
      .resolve-btn {
        padding: 0.35rem 1rem;
        cursor: pointer;
        border: 1px solid var(--app-primary);
        border-radius: 4px;
        background: var(--app-primary);
        color: #fff;
        font-weight: 600;
      }
      .resolve-btn:disabled {
        opacity: 0.5;
        cursor: default;
      }
      :host ::ng-deep .line-changed {
        background: color-mix(in srgb, var(--app-warning, #f59e0b) 22%, transparent);
        box-shadow: inset 3px 0 0 var(--app-warning, #f59e0b);
        display: block;
      }
      @media (max-width: 600px) {
        :host ::ng-deep .merge-dialog.p-dialog {
          width: 100vw !important;
          height: 100dvh !important;
          max-height: 100dvh !important;
          margin: 0 !important;
          border-radius: 0 !important;
        }
        .source-panes {
          flex-direction: column;
        }
        .source-pane:first-child {
          border-right: none;
          border-bottom: 1px solid var(--app-border);
        }
        .source-body {
          max-height: 22vh;
        }
        .result-pane {
          flex: 1 1 auto;
          min-height: 30vh;
        }
        .footer-actions {
          flex-wrap: wrap;
        }
      }
    `,
  ],
})
export class ConflictMergeEditorComponent {
  @Input() conflict!: Conflict;
  @Output() resolved = new EventEmitter<string>();
  @Output() cancelled = new EventEmitter<void>();

  readonly resultContent = signal('');

  localLines(): string[] {
    return (this.conflict.localContent ?? '').split('\n');
  }

  remoteLines(): string[] {
    return (this.conflict.remoteContent ?? '').split('\n');
  }

  lineClass(index: number, side: 'local' | 'remote'): string {
    const local = this.localLines();
    const remote = this.remoteLines();
    const own = side === 'local' ? local : remote;
    const other = side === 'local' ? remote : local;
    if (index >= own.length) return '';
    return own[index] !== (other[index] ?? undefined) ? 'line-changed' : '';
  }

  takeLocal(): void {
    this.resultContent.set(this.conflict.localContent ?? '');
  }

  takeRemote(): void {
    this.resultContent.set(this.conflict.remoteContent ?? '');
  }

  submit(): void {
    const content = this.resultContent().trim();
    if (content) {
      this.resolved.emit(this.resultContent());
    }
  }

  cancel(): void {
    this.cancelled.emit();
  }
}
