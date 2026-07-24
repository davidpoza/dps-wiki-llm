import { ChangeDetectionStrategy, Component, computed, inject, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { ApiService, NoteEntry } from '../services/api.service';

interface NoteItem extends NoteEntry {
  selected: boolean;
}

type Phase = 'loading' | 'ready' | 'error' | 'submitting' | 'done';

@Component({
  selector: 'app-keyword-selection-modal',
  standalone: true,
  imports: [FormsModule, ButtonModule, Checkbox, DialogModule, RouterLink],
  template: `
    <p-dialog
      [visible]="true"
      [modal]="true"
      [closable]="true"
      [draggable]="false"
      [resizable]="false"
      header="Regenerar keywords"
      [style]="{ width: '680px', maxHeight: '85vh' }"
      (onHide)="cancel.emit()"
    >
      <div class="modal-body">
        @if (phase() === 'loading') {
          <p class="loading-msg">Cargando notas…</p>
        }

        @if (phase() === 'error') {
          <p class="error-msg">{{ errorMessage() }}</p>
          <p-button label="Reintentar" severity="secondary" size="small" (onClick)="load()" />
        }

        @if (phase() === 'ready') {
          <div class="toolbar-row">
            <input
              class="search-input"
              type="text"
              placeholder="Buscar notas…"
              [(ngModel)]="searchTerm"
              (ngModelChange)="onSearchChange()"
            />
            <p-button
              label="Seleccionar todo"
              severity="secondary"
              size="small"
              [text]="true"
              (onClick)="selectAll()"
            />
            <p-button
              label="Deseleccionar todo"
              severity="secondary"
              size="small"
              [text]="true"
              (onClick)="deselectAll()"
            />
          </div>

          @if (filteredNotes().length === 0) {
            <p class="empty-msg">No hay notas que coincidan con la búsqueda.</p>
          } @else {
            <div class="notes-list">
              @for (folder of visibleFolders(); track folder) {
                <div class="folder-group">
                  <div class="folder-label">{{ folder }}</div>
                  @for (note of notesByFolder()[folder]; track note.path) {
                    <div class="note-row" [class.deselected]="!note.selected">
                      <p-checkbox
                        [(ngModel)]="note.selected"
                        [binary]="true"
                        (onChange)="notes.update((ns) => [...ns])"
                      />
                      <span class="note-title">{{ note.title }}</span>
                      @if (note.hasKeywords) {
                        <span class="kw-badge" title="Ya tiene keywords">✓</span>
                      }
                    </div>
                  }
                </div>
              }
            </div>
          }
        }

        @if (phase() === 'submitting') {
          <p class="loading-msg">Encolando job…</p>
        }

        @if (phase() === 'done') {
          <div class="done-phase">
            <p class="success-msg">Job encolado correctamente.</p>
            <a [routerLink]="['/jobs']" class="history-link" (click)="cancel.emit()">Ver historial de jobs →</a>
          </div>
        }
      </div>

      <ng-template pTemplate="footer">
        <div class="modal-footer">
          @if (submitError()) {
            <span class="error-msg small">{{ submitError() }}</span>
          }
          <p-button label="Cerrar" severity="secondary" size="small" (onClick)="cancel.emit()" />
          @if (phase() === 'ready') {
            <p-button [label]="confirmLabel()" [disabled]="selectedCount() === 0" size="small" (onClick)="submit()" />
          }
        </div>
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .modal-body {
        padding: 4px 0;
        min-height: 80px;
      }
      .toolbar-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
        flex-wrap: wrap;
      }
      .search-input {
        flex: 1;
        min-width: 160px;
        border: 1px solid var(--app-border-strong);
        border-radius: 6px;
        padding: 6px 10px;
        font-size: 0.875rem;
        color: var(--app-text);
        background: var(--app-surface-muted);
      }
      .search-input:focus {
        outline: 2px solid var(--app-primary);
        border-color: var(--app-primary);
      }
      .notes-list {
        max-height: 52vh;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .folder-group {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .folder-label {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--app-text-subtle);
        font-family: monospace;
        padding: 2px 0 4px;
        border-bottom: 1px solid var(--app-border);
        margin-bottom: 4px;
      }
      .note-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 4px 6px;
        border-radius: 4px;
        transition: opacity 0.15s;
      }
      .note-row.deselected {
        opacity: 0.45;
      }
      .note-title {
        flex: 1;
        font-size: 0.875rem;
        font-family: monospace;
        color: var(--app-text);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .kw-badge {
        font-size: 0.7rem;
        color: var(--app-success-text);
        font-weight: 700;
        flex-shrink: 0;
      }
      .loading-msg {
        color: var(--app-text-muted);
        font-size: 0.875rem;
        margin: 0;
      }
      .error-msg {
        color: var(--app-error-text);
        font-size: 0.875rem;
        margin: 0 0 8px;
      }
      .error-msg.small {
        margin: 0;
      }
      .empty-msg {
        color: var(--app-text-muted);
        font-size: 0.875rem;
      }
      .done-phase {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .success-msg {
        color: var(--app-success-text);
        margin: 0;
        font-size: 0.9rem;
        font-weight: 600;
      }
      .history-link {
        font-size: 0.875rem;
        color: var(--app-primary);
        text-decoration: none;
      }
      .history-link:hover {
        text-decoration: underline;
      }
      .modal-footer {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class KeywordSelectionModalComponent implements OnInit {
  private readonly api = inject(ApiService);

  readonly cancel = output<void>();

  readonly phase = signal<Phase>('loading');
  readonly notes = signal<NoteItem[]>([]);
  readonly errorMessage = signal('Error al cargar las notas. Inténtalo de nuevo.');
  readonly submitError = signal<string | null>(null);

  searchTerm = '';

  readonly filteredNotes = computed(() => {
    const term = this.searchTerm.toLowerCase();
    return this.notes().filter(
      (n) => !term || n.path.toLowerCase().includes(term) || n.title.toLowerCase().includes(term),
    );
  });

  readonly notesByFolder = computed<Record<string, NoteItem[]>>(() => {
    const map: Record<string, NoteItem[]> = {};
    for (const note of this.filteredNotes()) {
      const folder = note.path.substring(0, note.path.lastIndexOf('/'));
      if (!map[folder]) map[folder] = [];
      map[folder].push(note);
    }
    return map;
  });

  readonly visibleFolders = computed(() => Object.keys(this.notesByFolder()).sort());

  readonly selectedCount = computed(() => this.notes().filter((n) => n.selected).length);

  readonly confirmLabel = computed(() => {
    const n = this.selectedCount();
    return `Regenerar keywords (${n})`;
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.phase.set('loading');
    this.errorMessage.set('Error al cargar las notas. Inténtalo de nuevo.');
    this.api.listNotes(['wiki/concepts', 'wiki/sources']).subscribe({
      next: (entries) => {
        this.notes.set(entries.map((e) => ({ ...e, selected: false })));
        this.phase.set('ready');
      },
      error: () => {
        this.phase.set('error');
      },
    });
  }

  onSearchChange(): void {
    this.notes.update((ns) => [...ns]);
  }

  selectAll(): void {
    const term = this.searchTerm.toLowerCase();
    this.notes.update((ns) =>
      ns.map((n) => {
        const matches = !term || n.path.toLowerCase().includes(term) || n.title.toLowerCase().includes(term);
        return matches ? { ...n, selected: true } : n;
      }),
    );
  }

  deselectAll(): void {
    this.notes.update((ns) => ns.map((n) => ({ ...n, selected: false })));
  }

  submit(): void {
    const selected = this.notes()
      .filter((n) => n.selected)
      .map((n) => n.path);
    if (selected.length === 0) return;

    this.submitError.set(null);
    this.phase.set('submitting');
    this.api.regenerateKeywords(selected).subscribe({
      next: () => {
        this.phase.set('done');
      },
      error: () => {
        this.submitError.set('Error al encolar el job. Inténtalo de nuevo.');
        this.phase.set('ready');
      },
    });
  }
}
