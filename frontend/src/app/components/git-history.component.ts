import { ChangeDetectionStrategy, Component, computed, effect, inject, OnInit, signal, untracked } from '@angular/core';
import { NgClass } from '@angular/common';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { PaginatorModule, PaginatorState } from 'primeng/paginator';
import { Router } from '@angular/router';
import { ApiService } from '../services/api.service';
import { SyncService } from '../services/sync.service';
import { FileHistoryEntry } from '../types';

const PAGE_SIZE = 20;
const FIRST_PAGE = 0;

@Component({
  selector: 'app-git-history',
  standalone: true,
  imports: [NgClass, TranslocoPipe, PaginatorModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="history">
      <div class="history-header">
        <h2>{{ 'git.title' | transloco }}</h2>
        <div class="header-actions">
          <button class="sync-btn" [disabled]="sync.syncing()" (click)="sync.startSync()">
            {{ sync.syncing() ? ('sync.syncing' | transloco) : ('sync.button' | transloco) }}
          </button>
        </div>
      </div>

      @if (sync.result(); as r) {
        <p class="sync-msg" [class.error]="!r.ok">{{ r.message }}</p>
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
            <div class="path-row">
              <button class="editor-btn" [title]="entry.path" (click)="openFile(entry.path)">
                <i class="pi pi-file-edit"></i>
              </button>
              <span class="file-path" (click)="openFile(entry.path)">{{ entry.path }}</span>
            </div>
            <div class="meta-row">
              <span class="source-badge" [ngClass]="sourceClass(entry.source)">{{ sourceLabel(entry.source) }}</span>
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
        <div class="paginator-wrap">
          <p-paginator
            [rows]="pageSize"
            [totalRecords]="totalElements()"
            [first]="currentPage() * pageSize"
            [pageLinkSize]="3"
            (onPageChange)="onPage($event)"
          />
        </div>
      }
    </div>
  `,
  styles: [
    `
      .history {
        padding: 1rem;
      }
      .history-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 1rem;
      }
      .history-header h2 {
        margin: 0;
      }
      .header-actions {
        display: flex;
        gap: 0.5rem;
      }
      .sync-btn {
        padding: 0.25rem 0.75rem;
        cursor: pointer;
        border: 1px solid var(--app-border-strong);
        border-radius: 4px;
        background: var(--app-primary-soft);
        color: var(--app-primary);
        font-weight: 500;
      }
      .sync-btn:disabled {
        opacity: 0.6;
        cursor: default;
      }
      .sync-msg {
        font-size: 0.85rem;
        color: var(--app-text-muted);
      }
      .sync-msg.error {
        color: var(--app-error-text);
      }
      .error-msg {
        color: var(--app-error-text);
      }
      .loading,
      .empty {
        color: var(--app-text-muted);
      }
      .entry-list {
        display: flex;
        flex-direction: column;
        gap: 0.4rem;
        padding: 4px 2px;
      }
      .entry-card {
        border: 1px solid var(--app-border);
        border-radius: 6px;
        padding: 0.5rem 0.75rem;
        background: var(--app-surface);
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
        min-width: 0;
      }
      .path-row {
        display: flex;
        align-items: flex-start;
        gap: 0.4rem;
      }
      .editor-btn {
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        min-width: 28px;
        min-height: 28px;
        padding: 0.2rem;
        cursor: pointer;
        border: none;
        background: transparent;
        color: var(--app-primary);
        border-radius: 4px;
      }
      .editor-btn:hover {
        background: var(--app-primary-soft);
      }
      .editor-btn .pi {
        font-size: 0.9rem;
      }
      .file-path {
        font-family: monospace;
        font-size: 0.8rem;
        word-break: break-all;
        line-height: 1.4;
        padding-top: 0.15rem;
        cursor: pointer;
        color: var(--app-primary);
      }
      .file-path:hover {
        text-decoration: underline;
      }
      .meta-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex-wrap: wrap;
        font-size: 0.8rem;
      }
      .source-badge {
        font-size: 0.7rem;
        font-weight: 600;
        padding: 0.1rem 0.45rem;
        border-radius: 10px;
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }
      .source-local {
        background: #dbeafe;
        color: #1e40af;
      }
      .source-job {
        background: #ede9fe;
        color: #6d28d9;
      }
      .source-webdav {
        background: #dcfce7;
        color: #166534;
      }
      .stat-added {
        color: #22863a;
        font-weight: 600;
      }
      .stat-deleted {
        color: #cb2431;
        font-weight: 600;
      }
      .entry-date {
        color: var(--app-text-muted);
        font-size: 0.75rem;
        margin-left: auto;
      }
      .diff-btn {
        padding: 0.1rem 0.5rem;
        font-size: 0.75rem;
        cursor: pointer;
        border: 1px solid var(--app-border-strong);
        border-radius: 3px;
        background: var(--app-surface-muted);
        color: var(--app-text);
        white-space: nowrap;
      }
      .diff-btn:hover {
        background: var(--app-surface-subtle);
      }
      .diff-container {
        display: block;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        padding: 0;
      }
      .diff-loading {
        color: var(--app-text-muted);
        font-size: 0.8rem;
      }
      .diff-pre {
        margin: 0.25rem 0 0;
        font-size: 0.75rem;
        line-height: 1.45;
        background: #1e1e1e;
        color: #d4d4d4;
        border-radius: 4px;
        padding: 0.5rem;
        max-width: 100%;
        overflow-x: auto;
        white-space: pre;
      }
      .diff-pre span {
        display: block;
        white-space: pre;
      }
      .line-add {
        background: #1a3a1a;
        color: #7ee787;
      }
      .line-del {
        background: #3a1a1a;
        color: #ff7b72;
      }
      .line-hunk {
        background: #1a2a3a;
        color: #79c0ff;
      }
      .line-meta {
        color: #8b949e;
      }
      .paginator-wrap {
        margin-top: 0.75rem;
      }
      :host ::ng-deep .p-paginator {
        flex-wrap: wrap;
        row-gap: 4px;
        justify-content: center;
        padding: 4px 0;
        background: transparent;
      }
      @media (max-width: 600px) {
        .history {
          padding: 0.75rem;
        }
        .history-header {
          flex-wrap: wrap;
        }
        .diff-pre {
          font-size: 0.68rem;
          padding: 0.4rem;
        }
      }
    `,
  ],
})
export class GitHistoryComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly t = inject(TranslocoService);
  private readonly router = inject(Router);
  readonly sync = inject(SyncService);

  constructor() {
    // Refresh the history list whenever the vault changes (a sync completed or a conflict was
    // resolved). SyncService owns the sync/conflict orchestration; this page only reflects it.
    let lastChanged = this.sync.changed();
    effect(() => {
      const c = this.sync.changed();
      if (c === lastChanged) return;
      lastChanged = c;
      untracked(() => this.load());
    });
  }

  readonly entries = signal<FileHistoryEntry[]>([]);
  readonly totalElements = signal(0);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly pageSize = PAGE_SIZE;
  readonly currentPage = signal(FIRST_PAGE);
  readonly page = computed(() => this.entries());

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
      next: (result) => {
        this.entries.set(result.content);
        this.totalElements.set(result.totalElements);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(this.t.translate('git.errorLoadHistory'));
        this.loading.set(false);
      },
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
      this.diffVersion.update((v) => v + 1);
      return;
    }
    this.loadingDiffs.add(changeId);
    this.diffVersion.update((v) => v + 1);
    this.api.getChangeDiff(changeId).subscribe({
      next: (raw) => {
        this.openDiffs.set(changeId, raw.split('\n'));
        this.loadingDiffs.delete(changeId);
        this.diffVersion.update((v) => v + 1);
      },
      error: () => {
        this.openDiffs.set(changeId, [this.t.translate('git.errorLoadDiff')]);
        this.loadingDiffs.delete(changeId);
        this.diffVersion.update((v) => v + 1);
      },
    });
  }

  lineClass(line: string): string {
    if (line.startsWith('+') && !line.startsWith('+++')) return 'line-add';
    if (line.startsWith('-') && !line.startsWith('---')) return 'line-del';
    if (line.startsWith('@@')) return 'line-hunk';
    if (line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('--- ') || line.startsWith('+++ '))
      return 'line-meta';
    return '';
  }

  sourceLabel(source: string): string {
    return this.t.translate('git.source.' + source);
  }

  sourceClass(source: string): string {
    switch (source) {
      case 'LOCAL_EDIT':
        return 'source-local';
      case 'WEBDAV_PULL':
        return 'source-webdav';
      default:
        return 'source-job';
    }
  }

  openFile(path: string): void {
    this.router.navigate(['explorer', ...path.split('/')]);
  }

  formatDate(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return dateStr;
    }
  }
}
