import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { Scroller } from 'primeng/scroller';
import { BrokenLinkEntry } from '../services/api.service';

interface FileGroup {
  sourceFile: string;
  entries: BrokenLinkEntry[];
}

type Row =
  | { kind: 'header'; sourceFile: string }
  | { kind: 'item'; entry: BrokenLinkEntry };

@Component({
  selector: 'app-broken-links-modal',
  standalone: true,
  imports: [FormsModule, ButtonModule, Checkbox, DialogModule, Scroller],
  template: `
    <p-dialog
      [visible]="true"
      [modal]="true"
      [closable]="true"
      [draggable]="false"
      [resizable]="false"
      header="Enlaces rotos encontrados"
      [style]="{ width: '640px', maxHeight: '80vh' }"
      (onHide)="cancel.emit()"
    >
      <div class="modal-body">
        @if (groups().length === 0) {
          <p class="empty-msg">No se encontraron enlaces rotos.</p>
        } @else {
          <div class="modal-desc-row">
            <p class="modal-desc">
              Se encontraron <strong>{{ brokenLinks().length }}</strong> enlace(s) roto(s) en
              <strong>{{ groups().length }}</strong> fichero(s). Selecciona los que deseas eliminar.
            </p>
            <p-button
              [label]="allSelected() ? 'Desmarcar todos' : 'Marcar todos'"
              severity="secondary"
              size="small"
              (onClick)="toggleAll()"
            />
          </div>

          <div class="search-row">
            <input
              type="text"
              class="search-input"
              placeholder="Buscar por enlace o fichero…"
              [ngModel]="query()"
              (ngModelChange)="query.set($event)"
            />
            @if (query()) {
              <button
                type="button"
                class="search-clear"
                aria-label="Limpiar búsqueda"
                (click)="query.set('')"
              >
                ×
              </button>
            }
          </div>

          @if (rows().length === 0) {
            <p class="empty-msg">No hay coincidencias para «{{ query() }}».</p>
          } @else {
            <div class="rows-scroller-wrap">
              <p-scroller
                [items]="rows()"
                [itemSize]="40"
                [autoSize]="true"
                scrollHeight="360px"
                [style]="{ width: '100%' }"
                [trackBy]="rowTrackBy"
              >
                <ng-template pTemplate="item" let-row>
                  @if (row.kind === 'header') {
                    <div class="file-header row" [title]="row.sourceFile">{{ row.sourceFile }}</div>
                  } @else {
                    <div class="link-item row">
                      <p-checkbox
                        [ngModel]="isChecked(row.entry)"
                        [binary]="true"
                        [disabled]="row.entry.sourceSection !== 'Related'"
                        (onChange)="toggle(row.entry)"
                      />
                      <span class="link-label" [title]="row.entry.displayAlias || row.entry.link">
                        {{ row.entry.displayAlias || row.entry.link }}
                        @if (row.entry.displayAlias) {
                          <span class="link-slug">([[{{ row.entry.link }}]])</span>
                        }
                        @if (row.entry.sourceSection !== 'Related') {
                          <span class="section-badge">[{{ row.entry.sourceSection }}]</span>
                        }
                      </span>
                    </div>
                  }
                </ng-template>
              </p-scroller>
            </div>
          }
        }
      </div>

      <ng-template pTemplate="footer">
        <div class="modal-footer">
          <p-button label="Cancelar" severity="secondary" size="small" (onClick)="cancel.emit()" />
          <p-button
            [label]="deleteLabel()"
            severity="danger"
            size="small"
            [disabled]="selectedKeys().size === 0"
            (onClick)="onConfirm()"
          />
        </div>
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      .modal-body {
        padding: 4px 0;
      }
      .modal-desc-row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
        margin-bottom: 12px;
      }
      .modal-desc {
        margin: 0;
        font-size: 0.875rem;
        color: var(--app-text-muted);
      }
      .search-row {
        position: relative;
        margin-bottom: 12px;
      }
      .search-input {
        width: 100%;
        box-sizing: border-box;
        padding: 8px 32px 8px 12px;
        font-size: 0.875rem;
        color: var(--app-text);
        background: var(--app-surface);
        border: 1px solid var(--app-border);
        border-radius: 8px;
        outline: none;
      }
      .search-input:focus {
        border-color: var(--app-accent, var(--app-border));
      }
      .search-input::placeholder {
        color: var(--app-text-subtle);
      }
      .search-clear {
        position: absolute;
        right: 8px;
        top: 50%;
        transform: translateY(-50%);
        border: none;
        background: transparent;
        color: var(--app-text-muted);
        font-size: 1.15rem;
        line-height: 1;
        cursor: pointer;
        padding: 0 4px;
      }
      .rows-scroller-wrap {
        border: 1px solid var(--app-border);
        border-radius: 8px;
        overflow: hidden;
      }
      .row {
        height: 40px;
        box-sizing: border-box;
      }
      .file-header {
        line-height: 40px;
        padding: 0 14px;
        background: var(--app-surface-subtle);
        font-size: 0.8rem;
        font-family: monospace;
        color: var(--app-text-muted);
        border-bottom: 1px solid var(--app-border);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .link-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 0 14px;
      }
      .link-label {
        font-size: 0.875rem;
        color: var(--app-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
      }
      .link-slug {
        font-size: 0.75rem;
        color: var(--app-text-subtle);
        font-family: monospace;
        margin-left: 4px;
      }
      .section-badge {
        font-size: 0.7rem;
        color: var(--app-text-muted);
        font-family: monospace;
        margin-left: 6px;
        background: var(--app-surface-subtle);
        border: 1px solid var(--app-border);
        border-radius: 4px;
        padding: 1px 4px;
      }
      .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }
      .empty-msg {
        color: var(--app-text-muted);
        font-size: 0.875rem;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BrokenLinksModalComponent {
  readonly brokenLinks = input.required<BrokenLinkEntry[]>();
  // eslint-disable-next-line @angular-eslint/no-output-native
  readonly cancel = output<void>();
  readonly confirmed = output<{ sourceFile: string; link: string }[]>();

  readonly selectedKeys = signal<Set<string>>(new Set());
  readonly query = signal('');

  readonly groups = computed<FileGroup[]>(() => {
    const map = new Map<string, BrokenLinkEntry[]>();
    for (const entry of this.brokenLinks()) {
      if (!map.has(entry.sourceFile)) map.set(entry.sourceFile, []);
      map.get(entry.sourceFile)!.push(entry);
    }
    return Array.from(map.entries()).map(([sourceFile, entries]) => ({ sourceFile, entries }));
  });

  // Search only affects what is displayed; selection and deletion still operate over the full set.
  readonly filteredGroups = computed<FileGroup[]>(() => {
    const q = this.query().trim().toLowerCase();
    const groups = this.groups();
    if (!q) return groups;
    const result: FileGroup[] = [];
    for (const group of groups) {
      if (group.sourceFile.toLowerCase().includes(q)) {
        result.push(group);
        continue;
      }
      const entries = group.entries.filter(
        (e) =>
          e.link.toLowerCase().includes(q) ||
          (e.displayAlias?.toLowerCase().includes(q) ?? false),
      );
      if (entries.length > 0) result.push({ sourceFile: group.sourceFile, entries });
    }
    return result;
  });

  readonly rows = computed<Row[]>(() => {
    const out: Row[] = [];
    for (const group of this.filteredGroups()) {
      out.push({ kind: 'header', sourceFile: group.sourceFile });
      for (const entry of group.entries) out.push({ kind: 'item', entry });
    }
    return out;
  });

  // Entries can repeat the same sourceFile::link key across sections, so compare against the
  // set of unique keys (not brokenLinks().length) or "todos" would never register as selected.
  readonly allKeys = computed(() => new Set(this.brokenLinks().map((e) => this.entryKey(e))));

  readonly allSelected = computed(() => {
    const total = this.allKeys().size;
    return total > 0 && this.selectedKeys().size === total;
  });

  readonly deleteLabel = computed(() => {
    const n = this.selectedKeys().size;
    return n === 0 ? 'Eliminar seleccionados' : `Eliminar ${n} enlace${n === 1 ? '' : 's'}`;
  });

  constructor() {
    effect(() => {
      this.selectedKeys.set(new Set(this.allKeys()));
    });
  }

  readonly rowTrackBy = (_index: number, row: Row): string =>
    row.kind === 'header' ? `h:${row.sourceFile}` : `i:${this.entryKey(row.entry)}`;

  entryKey(entry: BrokenLinkEntry): string {
    return `${entry.sourceFile}::${entry.link}`;
  }

  isChecked(entry: BrokenLinkEntry): boolean {
    return this.selectedKeys().has(this.entryKey(entry));
  }

  toggle(entry: BrokenLinkEntry): void {
    const key = this.entryKey(entry);
    this.selectedKeys.update((keys) => {
      const next = new Set(keys);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  toggleAll(): void {
    if (this.allSelected()) {
      this.selectedKeys.set(new Set());
    } else {
      this.selectedKeys.set(new Set(this.allKeys()));
    }
  }

  onConfirm(): void {
    const keys = this.selectedKeys();
    const selected = this.brokenLinks()
      .filter((e) => e.sourceSection === 'Related' && keys.has(this.entryKey(e)))
      .map((e) => ({ sourceFile: e.sourceFile, link: e.link }));
    this.confirmed.emit(selected);
  }
}
