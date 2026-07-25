import { ChangeDetectionStrategy, Component, computed, inject, OnInit, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { ApiService, NoteEntry } from '../services/api.service';

interface NoteItem extends NoteEntry {
  selected: boolean;
}

type Phase = 'loading' | 'ready' | 'error' | 'enqueued' | 'enqueue-error';

@Component({
  selector: 'app-health-check-selection-modal',
  standalone: true,
  imports: [FormsModule, ButtonModule, Checkbox, DialogModule],
  template: `
    <p-dialog
      [visible]="true"
      [modal]="true"
      [closable]="true"
      [draggable]="false"
      [resizable]="false"
      header="Health Check parcial"
      [style]="{ width: '680px', maxHeight: '85vh' }"
      (onHide)="cancel.emit()"
    >
      <div class="modal-body">
        @if (phase() === 'loading') {
          <p class="loading-msg">Cargando notas…</p>
        }

        @if (phase() === 'error') {
          <p class="error-msg">{{ loadError() }}</p>
          <p-button label="Reintentar" severity="secondary" size="small" (onClick)="load()" />
        }

        @if (phase() === 'ready') {
          <p class="section-hint">
            Selecciona las notas sobre las que ejecutar la fase de descubrimiento de conexiones. Los embeddings se
            regenerarán sobre todo el vault de forma incremental.
          </p>
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
                    </div>
                  }
                </div>
              }
            </div>
          }
        }

        @if (phase() === 'enqueued') {
          <div class="enqueued-phase">
            <p class="success-msg">Job encolado.</p>
            <p class="enqueued-detail">Sigue el progreso en el panel de jobs.</p>
          </div>
        }

        @if (phase() === 'enqueue-error') {
          <p class="error-msg">Error al encolar el Health Check. Inténtalo de nuevo.</p>
        }
      </div>

      <ng-template pTemplate="footer">
        <div class="modal-footer">
          <p-button label="Cerrar" severity="secondary" size="small" (onClick)="cancel.emit()" />
          @if (phase() === 'ready') {
            <p-button [label]="confirmLabel()" [disabled]="selectedCount() === 0" size="small" (onClick)="submit()" />
          }
          @if (phase() === 'enqueue-error') {
            <p-button label="Reintentar" size="small" (onClick)="retry()" />
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
      .section-hint {
        font-size: 0.8rem;
        color: var(--app-text-subtle);
        margin: 0 0 12px;
        line-height: 1.4;
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
      .empty-msg {
        color: var(--app-text-muted);
        font-size: 0.875rem;
      }
      .enqueued-phase {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .success-msg {
        color: var(--app-success-text);
        margin: 0;
        font-size: 0.9rem;
        font-weight: 600;
      }
      .enqueued-detail {
        color: var(--app-text-subtle);
        font-size: 0.875rem;
        margin: 0;
      }
      .modal-footer {
        display: flex;
        justify-content: flex-end;
        align-items: center;
        gap: 10px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HealthCheckSelectionModalComponent implements OnInit {
  private readonly api = inject(ApiService);

  readonly cancel = output<void>();

  readonly phase = signal<Phase>('loading');
  readonly notes = signal<NoteItem[]>([]);
  readonly loadError = signal('Error al cargar las notas. Inténtalo de nuevo.');

  searchTerm = '';
  private lastSelectedPaths: string[] = [];

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
    return `Lanzar Health Check (${n})`;
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.phase.set('loading');
    this.api.listNotes(['wiki']).subscribe({
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
    this.lastSelectedPaths = selected;
    this.enqueue(selected);
  }

  retry(): void {
    this.enqueue(this.lastSelectedPaths);
  }

  private enqueue(paths: string[]): void {
    this.api.enqueueHealthCheckPartial(paths).subscribe({
      next: () => {
        this.phase.set('enqueued');
      },
      error: () => {
        this.phase.set('enqueue-error');
      },
    });
  }
}
