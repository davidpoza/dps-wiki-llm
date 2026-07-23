import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { BrokenLinkEntry } from '../services/api.service';

interface FileGroup {
  sourceFile: string;
  entries: BrokenLinkEntry[];
}

@Component({
  selector: 'app-broken-links-modal',
  standalone: true,
  imports: [FormsModule, ButtonModule, Checkbox, DialogModule],
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
          <div class="groups-list">
            @for (group of groups(); track group.sourceFile) {
              <div class="file-group">
                <div class="file-header">{{ group.sourceFile }}</div>
                <div class="items-list">
                  @for (entry of group.entries; track entryKey(entry)) {
                    <div class="link-item">
                      <p-checkbox
                        [ngModel]="isChecked(entry)"
                        [binary]="true"
                        [disabled]="entry.sourceSection !== 'Related'"
                        (onChange)="toggle(entry)"
                      />
                      <span class="link-label">
                        {{ entry.displayAlias || entry.link }}
                        @if (entry.displayAlias) {
                          <span class="link-slug">([[{{ entry.link }}]])</span>
                        }
                        @if (entry.sourceSection !== 'Related') {
                          <span class="section-badge">[{{ entry.sourceSection }}]</span>
                        }
                      </span>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
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
        margin-bottom: 16px;
      }
      .modal-desc {
        margin: 0;
        font-size: 0.875rem;
        color: var(--app-text-muted);
      }
      .groups-list {
        display: flex;
        flex-direction: column;
        gap: 16px;
        max-height: 50vh;
        overflow-y: auto;
      }
      .file-group {
        border: 1px solid var(--app-border);
        border-radius: 8px;
        overflow: hidden;
        flex-shrink: 0;
      }
      .file-header {
        padding: 8px 14px;
        background: var(--app-surface-subtle);
        font-size: 0.8rem;
        font-family: monospace;
        color: var(--app-text-muted);
        border-bottom: 1px solid var(--app-border);
      }
      .items-list {
        padding: 8px 14px;
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .link-item {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .link-label {
        font-size: 0.875rem;
        color: var(--app-text);
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

  readonly groups = computed<FileGroup[]>(() => {
    const map = new Map<string, BrokenLinkEntry[]>();
    for (const entry of this.brokenLinks()) {
      if (!map.has(entry.sourceFile)) map.set(entry.sourceFile, []);
      map.get(entry.sourceFile)!.push(entry);
    }
    return Array.from(map.entries()).map(([sourceFile, entries]) => ({ sourceFile, entries }));
  });

  readonly allSelected = computed(() => this.selectedKeys().size === this.brokenLinks().length);

  readonly deleteLabel = computed(() => {
    const n = this.selectedKeys().size;
    return n === 0 ? 'Eliminar seleccionados' : `Eliminar ${n} enlace${n === 1 ? '' : 's'}`;
  });

  constructor() {
    effect(() => {
      const keys = new Set(this.brokenLinks().map((e) => this.entryKey(e)));
      this.selectedKeys.set(keys);
    });
  }

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
      this.selectedKeys.set(new Set(this.brokenLinks().map((e) => this.entryKey(e))));
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
