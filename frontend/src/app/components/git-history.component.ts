import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { DialogModule } from 'primeng/dialog';
import { PaginatorModule, PaginatorState } from 'primeng/paginator';
import { ApiService, SyncEvent } from '../services/api.service';
import { Conflict, FileHistoryEntry, SyncResult } from '../types';

const PAGE_SIZE = 20;
const FIRST_PAGE = 0;

@Component({
  selector: 'app-git-history',
  standalone: true,
  imports: [NgClass, TranslocoPipe, DialogModule, PaginatorModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="history">
      <div class="history-header">
        <h2>{{ 'git.title' | transloco }}</h2>
        <div class="header-actions">
          <button class="sync-btn" [disabled]="syncing()" (click)="sync()">
            {{ syncing() ? ('sync.syncing' | transloco) : ('sync.button' | transloco) }}
          </button>
          <button class="refresh-btn" (click)="load()">{{ 'git.refresh' | transloco }}</button>
        </div>
      </div>

      @if (syncing() && syncTotal() > 0) {
        <div class="sync-progress-wrap">
          <div class="sync-progress-bar" [style.width.%]="(syncProcessed() / syncTotal()) * 100"></div>
          <span class="sync-progress-label">{{ syncProcessed() }}/{{ syncTotal() }}</span>
        </div>
      }

      @if (syncMessage()) {
        <p class="sync-msg" [class.error]="syncIsError()">{{ syncMessage() }}</p>
      }

      @if (error()) {
        <p class="error-msg">{{ error() }}</p>
      }

      @if (loading()) {
        <p class="loading">{{ 'git.loading' | transloco }}</p>
      }

      @if (!loading() && entries().length === 0 && !error()) {
        <p class="empty">{{ 'git.empty' | transloco }}</p>
      }

      <div class="entry-list">
        @for (entry of page(); track entry.changeId) {
          <div class="entry-card">
            <div class="entry-row">
              <span class="source-badge" [ngClass]="sourceClass(entry.source)">{{ sourceLabel(entry.source) }}</span>
              <span class="file-path" [title]="entry.path">{{ entry.path }}</span>
              <span class="stat-added">+{{ entry.linesAdded }}</span>
              <span class="stat-deleted">-{{ entry.linesDeleted }}</span>
              <span class="entry-date">{{ formatDate(entry.createdAt) }}</span>
              <button class="diff-btn" (click)="toggleDiff(entry.changeId)">
                {{ isDiffOpen(entry.changeId) ? ('git.hideDiff' | transloco) : ('git.showDiff' | transloco) }}
              </button>
            </div>
            @if (isDiffOpen(entry.changeId)) {
              <div class="diff-container">
                @if (isDiffLoading(entry.changeId)) {
                  <span class="diff-loading">{{ 'git.loadingDiff' | transloco }}</span>
                } @else {
                  <pre class="diff-pre">@for (line of getDiffLines(entry.changeId); track $index) {
<span [ngClass]="lineClass(line)">{{ line }}</span>
}</pre>
                }
              </div>
            }
          </div>
        }
      </div>

      @if (totalElements() > pageSize) {
        <p-paginator
          [rows]="pageSize"
          [totalRecords]="totalElements()"
          [first]="currentPage() * pageSize"
          (onPageChange)="onPage($event)"
        />
      }
    </div>

    <p-dialog
      [header]="'sync.conflictsHeader' | transloco"
      [(visible)]="showConflicts"
      [modal]="true"
      [draggable]="false"
      [style]="{ width: '90vw', maxWidth: '1100px' }"
    >
      @if (conflicts().length === 0) {
        <p class="empty">{{ 'sync.noConflicts' | transloco }}</p>
      }
      @for (conflict of conflicts(); track conflict.path) {
        <div class="conflict">
          <div class="conflict-path">{{ conflict.path }}</div>
          <div class="conflict-panes">
            <div class="conflict-pane">
              <div class="pane-header">
                <span>{{ 'sync.localVersion' | transloco }}</span>
                <button class="keep-btn" (click)="resolve(conflict.path, 'LOCAL')">{{ 'sync.keepThis' | transloco }}</button>
              </div>
              <pre class="pane-body">@for (line of splitLines(conflict.localContent); track $index) {
<span [ngClass]="conflictLineClass(conflict, $index, 'local')">{{ line }}</span>
}</pre>
            </div>
            <div class="conflict-pane">
              <div class="pane-header">
                <span>{{ 'sync.remoteVersion' | transloco }}</span>
                <button class="keep-btn" (click)="resolve(conflict.path, 'REMOTE')">{{ 'sync.keepThis' | transloco }}</button>
              </div>
              <pre class="pane-body">@for (line of splitLines(conflict.remoteContent); track $index) {
<span [ngClass]="conflictLineClass(conflict, $index, 'remote')">{{ line }}</span>
}</pre>
            </div>
          </div>
        </div>
      }
    </p-dialog>
  `,
  styles: [`
    .history { padding: 1rem; }
    .history-header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; margin-bottom: 1rem; }
    .history-header h2 { margin: 0; }
    .header-actions { display: flex; gap: 0.5rem; }
    .sync-btn, .refresh-btn { padding: 0.25rem 0.75rem; cursor: pointer; border: 1px solid var(--app-border-strong); border-radius: 4px; background: var(--app-surface-muted); color: var(--app-text); }
    .sync-btn { background: var(--app-primary-soft); color: var(--app-primary); font-weight: 500; }
    .sync-btn:disabled { opacity: 0.6; cursor: default; }
    .sync-progress-wrap { position: relative; height: 20px; background: var(--app-border); border-radius: 10px; overflow: hidden; margin-bottom: 0.5rem; }
    .sync-progress-bar { height: 100%; background: var(--app-primary); border-radius: 10px; transition: width 0.15s ease; }
    .sync-progress-label { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 0.7rem; font-weight: 600; color: var(--app-text); }
    .sync-msg { font-size: 0.85rem; color: var(--app-text-muted); }
    .sync-msg.error { color: var(--app-error-text); }
    .error-msg { color: var(--app-error-text); }
    .loading, .empty { color: var(--app-text-muted); }
    .entry-list { display: flex; flex-direction: column; gap: 0.4rem; overflow-y: auto; max-height: calc(100vh - 220px); padding: 4px 2px; }
    .entry-card { border: 1px solid var(--app-border); border-radius: 6px; padding: 0.5rem 0.75rem; background: var(--app-surface); }
    .entry-row { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; font-size: 0.85rem; }
    .source-badge { font-size: 0.7rem; font-weight: 600; padding: 0.1rem 0.45rem; border-radius: 10px; text-transform: uppercase; letter-spacing: 0.03em; }
    .source-local { background: #dbeafe; color: #1e40af; }
    .source-job { background: #ede9fe; color: #6d28d9; }
    .source-webdav { background: #dcfce7; color: #166534; }
    .file-path { flex: 1; font-family: monospace; font-size: 0.8rem; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .stat-added { color: #22863a; font-weight: 600; }
    .stat-deleted { color: #cb2431; font-weight: 600; }
    .entry-date { color: var(--app-text-muted); font-size: 0.75rem; }
    .diff-btn { padding: 0.1rem 0.5rem; font-size: 0.75rem; cursor: pointer; border: 1px solid var(--app-border-strong); border-radius: 3px; background: var(--app-surface-muted); color: var(--app-text); white-space: nowrap; }
    .diff-btn:hover { background: var(--app-surface-subtle); }
    .diff-container { display: block; width: 100%; padding: 0; }
    .diff-loading { color: var(--app-text-muted); font-size: 0.8rem; }
    .diff-pre, .pane-body { margin: 0.25rem 0 0; font-size: 0.75rem; line-height: 1.45; background: #1e1e1e; color: #d4d4d4; border-radius: 4px; padding: 0.5rem; overflow-x: auto; white-space: pre; }
    .diff-pre span, .pane-body span { display: block; white-space: pre; }
    .line-add { background: #1a3a1a; color: #7ee787; }
    .line-del { background: #3a1a1a; color: #ff7b72; }
    .line-hunk { background: #1a2a3a; color: #79c0ff; }
    .line-meta { color: #8b949e; }
    .conflict { margin-bottom: 1.25rem; }
    .conflict-path { font-family: monospace; font-weight: 600; margin-bottom: 0.4rem; }
    .conflict-panes { display: flex; gap: 0.75rem; }
    .conflict-pane { flex: 1; min-width: 0; border: 1px solid var(--app-border); border-radius: 6px; overflow: hidden; }
    .pane-header { display: flex; align-items: center; justify-content: space-between; padding: 0.4rem 0.6rem; background: var(--app-surface-subtle); font-size: 0.8rem; font-weight: 600; }
    .keep-btn { padding: 0.15rem 0.6rem; font-size: 0.75rem; cursor: pointer; border: 1px solid var(--app-primary); border-radius: 4px; background: var(--app-primary); color: #fff; }
    .pane-body { margin: 0; border-radius: 0; max-height: 50vh; }
    .line-changed { background: #3a2f1a; color: #ffd58a; }
  `]
})
export class GitHistoryComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly t = inject(TranslocoService);

  readonly entries = signal<FileHistoryEntry[]>([]);
  readonly totalElements = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly pageSize = PAGE_SIZE;
  readonly currentPage = signal(FIRST_PAGE);
  readonly page = computed(() => this.entries());

  readonly syncing = signal(false);
  readonly syncMessage = signal<string | null>(null);
  readonly syncIsError = signal(false);
  readonly syncProcessed = signal(0);
  readonly syncTotal = signal(0);
  readonly conflicts = signal<Conflict[]>([]);
  readonly showConflicts = signal(false);

  private readonly openDiffs = new Map<string, string[]>();
  private readonly loadingDiffs = new Set<string>();
  private readonly diffVersion = signal(0);

  ngOnInit(): void {
    this.load();
  }

  onPage(e: PaginatorState): void {
    const newPage = Math.floor((e.first ?? 0) / this.pageSize);
    this.currentPage.set(newPage);
    this.loadPage(newPage);
  }

  load(): void {
    this.currentPage.set(FIRST_PAGE);
    this.loadPage(FIRST_PAGE);
  }

  private loadPage(page: number): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.getHistory(page, this.pageSize).subscribe({
      next: result => {
        this.entries.set(result.content);
        this.totalElements.set(result.totalElements);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(this.t.translate('git.errorLoadHistory'));
        this.loading.set(false);
      }
    });
  }

  sync(): void {
    this.syncing.set(true);
    this.syncMessage.set(null);
    this.syncIsError.set(false);
    this.syncProcessed.set(0);
    this.syncTotal.set(0);
    this.api.syncWebdav().subscribe({
      next: (event: SyncEvent) => {
        if (event.type === 'progress') {
          this.syncProcessed.set(event.processed);
          this.syncTotal.set(event.total);
        } else {
          const result: SyncResult = event.result;
          this.syncing.set(false);
          this.syncIsError.set(false);
          this.syncMessage.set(this.t.translate('sync.summary', {
            pulled: result.pulled.length,
            deleted: result.deleted.length,
            conflicts: result.conflicts.length,
          }));
          this.load();
          if (result.conflicts.length > 0) {
            this.loadConflicts();
          }
        }
      },
      error: (err: { code?: string; message?: string }) => {
        this.syncing.set(false);
        this.syncIsError.set(true);
        this.syncMessage.set(
          err.code === 'not_configured'
            ? this.t.translate('sync.notConfigured')
            : this.t.translate('sync.error'));
      }
    });
  }

  private loadConflicts(): void {
    this.api.getConflicts().subscribe({
      next: conflicts => {
        this.conflicts.set(conflicts);
        this.showConflicts.set(conflicts.length > 0);
      },
      error: () => {
        this.syncIsError.set(true);
        this.syncMessage.set(this.t.translate('sync.error'));
      }
    });
  }

  resolve(path: string, keep: 'LOCAL' | 'REMOTE'): void {
    this.api.resolveConflict(path, keep).subscribe({
      next: () => {
        const remaining = this.conflicts().filter(c => c.path !== path);
        this.conflicts.set(remaining);
        if (remaining.length === 0) {
          this.showConflicts.set(false);
        }
        this.load();
      },
      error: () => {
        this.syncIsError.set(true);
        this.syncMessage.set(this.t.translate('sync.resolveError'));
      }
    });
  }

  isDiffOpen(changeId: string): boolean {
    this.diffVersion();
    return this.openDiffs.has(changeId);
  }

  isDiffLoading(changeId: string): boolean {
    this.diffVersion();
    return this.loadingDiffs.has(changeId);
  }

  getDiffLines(changeId: string): string[] {
    this.diffVersion();
    return this.openDiffs.get(changeId) ?? [];
  }

  toggleDiff(changeId: string): void {
    if (this.openDiffs.has(changeId)) {
      this.openDiffs.delete(changeId);
      this.diffVersion.update(v => v + 1);
      return;
    }
    this.loadingDiffs.add(changeId);
    this.diffVersion.update(v => v + 1);
    this.api.getChangeDiff(changeId).subscribe({
      next: raw => {
        this.openDiffs.set(changeId, raw.split('\n'));
        this.loadingDiffs.delete(changeId);
        this.diffVersion.update(v => v + 1);
      },
      error: () => {
        this.openDiffs.set(changeId, [this.t.translate('git.errorLoadDiff')]);
        this.loadingDiffs.delete(changeId);
        this.diffVersion.update(v => v + 1);
      }
    });
  }

  lineClass(line: string): string {
    if (line.startsWith('+') && !line.startsWith('+++')) return 'line-add';
    if (line.startsWith('-') && !line.startsWith('---')) return 'line-del';
    if (line.startsWith('@@')) return 'line-hunk';
    if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ ')) return 'line-meta';
    return '';
  }

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

  sourceLabel(source: string): string {
    return this.t.translate('git.source.' + source);
  }

  sourceClass(source: string): string {
    switch (source) {
      case 'LOCAL_EDIT': return 'source-local';
      case 'WEBDAV_PULL': return 'source-webdav';
      default: return 'source-job';
    }
  }

  formatDate(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return dateStr;
    }
  }
}
