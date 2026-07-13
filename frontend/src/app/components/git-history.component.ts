import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { ApiService } from '../services/api.service';
import { Commit } from '../types';

@Component({
  selector: 'app-git-history',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="git-history">
      <div class="git-history-header">
        <h2>Historial Git</h2>
        <button class="refresh-btn" (click)="load()">Actualizar</button>
      </div>

      @if (error()) {
        <p class="error-msg">{{ error() }}</p>
      }

      @if (loading()) {
        <p class="loading">Cargando historial...</p>
      }

      @if (!loading() && commits().length === 0 && !error()) {
        <p class="empty">No hay commits en el repositorio.</p>
      }

      <div class="commit-list">
        @for (commit of commits(); track commit.sha) {
          <div class="commit-card">
            <div class="commit-meta">
              <code class="commit-sha">{{ commit.sha.slice(0, 7) }}</code>
              <span class="commit-author">{{ commit.author }}</span>
              <span class="commit-date">{{ formatDate(commit.date) }}</span>
            </div>
            <p class="commit-message">{{ commit.message }}</p>
            @if (commit.files.length > 0) {
              <details class="commit-files">
                <summary>{{ commit.files.length }} archivo(s) modificado(s)</summary>
                <ul>
                  @for (file of commit.files; track file.path) {
                    <li>
                      <span class="file-path">{{ file.path }}</span>
                      <span class="stat-added">+{{ file.added }}</span>
                      <span class="stat-deleted">-{{ file.deleted }}</span>
                    </li>
                  }
                </ul>
              </details>
            }
            <button class="reset-btn" (click)="resetTo(commit)">
              Revertir a este commit
            </button>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .git-history { padding: 1rem; }
    .git-history-header { display: flex; align-items: center; gap: 1rem; margin-bottom: 1rem; }
    .git-history-header h2 { margin: 0; }
    .refresh-btn { padding: 0.25rem 0.75rem; cursor: pointer; }
    .error-msg { color: red; }
    .loading, .empty { color: #888; }
    .commit-list { display: flex; flex-direction: column; gap: 0.75rem; }
    .commit-card { border: 1px solid #ddd; border-radius: 6px; padding: 0.75rem 1rem; }
    .commit-meta { display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.25rem; font-size: 0.85rem; }
    .commit-sha { background: #f0f0f0; padding: 0.1rem 0.4rem; border-radius: 3px; font-family: monospace; }
    .commit-author { font-weight: 500; }
    .commit-date { color: #888; }
    .commit-message { margin: 0.25rem 0 0.5rem; font-size: 0.95rem; }
    .commit-files { margin-bottom: 0.5rem; font-size: 0.85rem; }
    .commit-files ul { margin: 0.25rem 0 0 1rem; padding: 0; list-style: none; }
    .commit-files li { display: flex; gap: 0.5rem; align-items: center; padding: 0.1rem 0; }
    .file-path { flex: 1; font-family: monospace; font-size: 0.8rem; }
    .stat-added { color: #22863a; font-weight: 600; }
    .stat-deleted { color: #cb2431; font-weight: 600; }
    .reset-btn { padding: 0.25rem 0.75rem; cursor: pointer; color: #c0392b; border: 1px solid #c0392b; background: transparent; border-radius: 4px; font-size: 0.85rem; }
    .reset-btn:hover { background: #c0392b; color: white; }
  `]
})
export class GitHistoryComponent implements OnInit {
  private readonly api = inject(ApiService);

  readonly commits = signal<Commit[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.getGitLog().subscribe({
      next: commits => {
        this.commits.set(commits);
        this.loading.set(false);
      },
      error: () => {
        this.error.set('Error al cargar el historial de commits.');
        this.loading.set(false);
      }
    });
  }

  resetTo(commit: Commit): void {
    const confirmed = window.confirm(
      `¿Revertir el repositorio al commit ${commit.sha.slice(0, 7)}?\n\n"${commit.message}"\n\nEsta operación es destructiva e irreversible.`
    );
    if (!confirmed) return;

    this.api.resetToCommit(commit.sha).subscribe({
      next: () => this.load(),
      error: () => this.error.set(`Error al revertir al commit ${commit.sha.slice(0, 7)}.`)
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
