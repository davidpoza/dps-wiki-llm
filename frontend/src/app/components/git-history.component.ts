import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { NgClass } from '@angular/common';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ConfirmationService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { PaginatorModule, PaginatorState } from 'primeng/paginator';
import { ApiService } from '../services/api.service';
import { Commit } from '../types';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-git-history',
  standalone: true,
  imports: [NgClass, TranslocoPipe, ConfirmDialogModule, PaginatorModule],
  providers: [ConfirmationService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-confirmDialog />
    <div class="git-history">
      <div class="git-history-header">
        <h2>{{ 'git.title' | transloco }}</h2>
        <button class="refresh-btn" (click)="load()">{{ 'git.refresh' | transloco }}</button>
      </div>

      @if (error()) {
        <p class="error-msg">{{ error() }}</p>
      }

      @if (loading()) {
        <p class="loading">{{ 'git.loading' | transloco }}</p>
      }

      @if (!loading() && commits().length === 0 && !error()) {
        <p class="empty">{{ 'git.empty' | transloco }}</p>
      }

      <div class="commit-list">
        @for (commit of page(); track commit.sha) {
          <div class="commit-card">
            <div class="commit-meta">
              <code class="commit-sha">{{ commit.sha.slice(0, 7) }}</code>
              <span class="commit-author">{{ commit.author }}</span>
              <span class="commit-date">{{ formatDate(commit.date) }}</span>
            </div>
            <p class="commit-message">{{ commit.message }}</p>
            @if (commit.files.length > 0) {
              <details class="commit-files">
                <summary>{{ 'git.filesModified' | transloco: { count: commit.files.length } }}</summary>
                <ul>
                  @for (file of commit.files; track file.path) {
                    <li>
                      <span class="file-path">{{ file.path }}</span>
                      <span class="stat-added">+{{ file.added }}</span>
                      <span class="stat-deleted">-{{ file.deleted }}</span>
                      <button
                        class="diff-btn"
                        (click)="toggleDiff(commit.sha, file.path)"
                      >{{ isDiffOpen(commit.sha, file.path) ? ('git.hideDiff' | transloco) : ('git.showDiff' | transloco) }}</button>
                    </li>
                    @if (isDiffOpen(commit.sha, file.path)) {
                      <li class="diff-container">
                        @if (isDiffLoading(commit.sha, file.path)) {
                          <span class="diff-loading">{{ 'git.loadingDiff' | transloco }}</span>
                        } @else {
                          <pre class="diff-pre">@for (line of getDiffLines(commit.sha, file.path); track $index) {
<span [ngClass]="lineClass(line)">{{ line }}</span>
}</pre>
                        }
                      </li>
                    }
                  }
                </ul>
              </details>
            }
            <button class="reset-btn" (click)="resetTo(commit)">
              {{ 'git.revertTo' | transloco }}
            </button>
          </div>
        }
      </div>

      @if (commits().length > pageSize) {
        <p-paginator
          [rows]="pageSize"
          [totalRecords]="commits().length"
          [first]="first()"
          (onPageChange)="onPage($event)"
        />
      }
    </div>
  `,
  styles: [`
    .git-history { padding: 1rem; }
    .git-history-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
    .git-history-header h2 { margin: 0; }
    .refresh-btn { padding: 0.25rem 0.75rem; cursor: pointer; }
    .error-msg { color: var(--app-error-text); }
    .loading, .empty { color: var(--app-text-muted); }
    .commit-list { display: flex; flex-direction: column; gap: 0.75rem; overflow-y: auto; max-height: calc(100vh - 200px); padding: 4px 2px; }
    .commit-card { border: 1px solid var(--app-border); border-radius: 6px; padding: 0.75rem 1rem; background: var(--app-surface); }
    .commit-meta { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.25rem; font-size: 0.85rem; }
    .commit-sha { background: var(--app-surface-subtle); padding: 0.1rem 0.4rem; border-radius: 3px; font-family: monospace; }
    .commit-author { font-weight: 500; }
    .commit-date { color: var(--app-text-muted); }
    .commit-message { margin: 0.25rem 0 0.5rem; font-size: 0.95rem; }
    .commit-files { margin-bottom: 0.5rem; font-size: 0.85rem; }
    .commit-files ul { margin: 0.25rem 0 0 0; padding: 0; list-style: none; }
    .commit-files li { display: flex; gap: 0.5rem; align-items: center; padding: 0.15rem 0; flex-wrap: wrap; }
    .file-path { flex: 1; font-family: monospace; font-size: 0.8rem; min-width: 0; }
    .stat-added { color: #22863a; font-weight: 600; }
    .stat-deleted { color: #cb2431; font-weight: 600; }
    .diff-btn { padding: 0.1rem 0.5rem; font-size: 0.75rem; cursor: pointer; border: 1px solid var(--app-border-strong); border-radius: 3px; background: var(--app-surface-muted); color: var(--app-text); white-space: nowrap; }
    .diff-btn:hover { background: var(--app-surface-subtle); }
    .diff-container { display: block; width: 100%; padding: 0; }
    .diff-loading { color: var(--app-text-muted); font-size: 0.8rem; }
    .diff-pre { margin: 0.25rem 0 0.5rem; font-size: 0.75rem; line-height: 1.45; background: #1e1e1e; color: #d4d4d4; border-radius: 4px; padding: 0.5rem; overflow-x: auto; white-space: pre; }
    .diff-pre span { display: block; white-space: pre; }
    .line-add { background: #1a3a1a; color: #7ee787; }
    .line-del { background: #3a1a1a; color: #ff7b72; }
    .line-hunk { background: #1a2a3a; color: #79c0ff; }
    .line-meta { color: #8b949e; }
    .reset-btn { padding: 0.25rem 0.75rem; cursor: pointer; color: var(--app-error-text); border: 1px solid var(--app-error-text); background: transparent; border-radius: 4px; font-size: 0.85rem; }
    .reset-btn:hover { background: var(--app-error-text); color: #fff; }
  `]
})
export class GitHistoryComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly t = inject(TranslocoService);
  private readonly confirmationService = inject(ConfirmationService);

  readonly commits = signal<Commit[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  readonly pageSize = PAGE_SIZE;
  readonly first = signal(0);
  readonly page = computed(() => this.commits().slice(this.first(), this.first() + this.pageSize));

  private readonly openDiffs = new Map<string, string[]>();
  private readonly loadingDiffs = new Set<string>();
  private readonly diffVersion = signal(0);

  ngOnInit(): void {
    this.load();
  }

  onPage(e: PaginatorState): void {
    this.first.set(e.first ?? 0);
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.first.set(0);
    this.api.getGitLog().subscribe({
      next: commits => {
        this.commits.set(commits);
        this.loading.set(false);
      },
      error: () => {
        this.error.set(this.t.translate('git.errorLoadHistory'));
        this.loading.set(false);
      }
    });
  }

  private diffKey(sha: string, path: string): string {
    return `${sha}::${path}`;
  }

  isDiffOpen(sha: string, path: string): boolean {
    this.diffVersion();
    return this.openDiffs.has(this.diffKey(sha, path));
  }

  isDiffLoading(sha: string, path: string): boolean {
    this.diffVersion();
    return this.loadingDiffs.has(this.diffKey(sha, path));
  }

  getDiffLines(sha: string, path: string): string[] {
    this.diffVersion();
    return this.openDiffs.get(this.diffKey(sha, path)) ?? [];
  }

  toggleDiff(sha: string, path: string): void {
    const key = this.diffKey(sha, path);
    if (this.openDiffs.has(key)) {
      this.openDiffs.delete(key);
      this.diffVersion.update(v => v + 1);
      return;
    }
    this.loadingDiffs.add(key);
    this.diffVersion.update(v => v + 1);
    this.api.getFileDiff(sha, path).subscribe({
      next: raw => {
        this.openDiffs.set(key, raw.split('\n'));
        this.loadingDiffs.delete(key);
        this.diffVersion.update(v => v + 1);
      },
      error: () => {
        this.openDiffs.set(key, [this.t.translate('git.errorLoadDiff')]);
        this.loadingDiffs.delete(key);
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

  resetTo(commit: Commit): void {
    this.confirmationService.confirm({
      header: this.t.translate('git.revertConfirmHeader'),
      message: this.t.translate('git.revertConfirmMessage', {
        sha: commit.sha.slice(0, 7),
        message: commit.message,
      }),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.api.resetToCommit(commit.sha).subscribe({
          next: () => this.load(),
          error: () => this.error.set(this.t.translate('git.errorRevert', { sha: commit.sha.slice(0, 7) })),
        });
      },
    });
  }

  formatDate(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return dateStr;
    }
  }
}
