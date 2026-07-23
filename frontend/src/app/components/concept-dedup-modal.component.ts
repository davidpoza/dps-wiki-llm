import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnDestroy,
  OnInit,
  output,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { Checkbox } from 'primeng/checkbox';
import { DialogModule } from 'primeng/dialog';
import { ProgressBarModule } from 'primeng/progressbar';
import { ApiService, ConceptDedupGroup, ConceptDedupScanEvent } from '../services/api.service';
import { Subscription } from 'rxjs';
import { RouterLink } from '@angular/router';

type Phase = 'scanning' | 'results' | 'error' | 'confirming' | 'confirmed';

interface GroupItem extends ConceptDedupGroup {
  selected: boolean;
  editingCanonical: boolean;
  editedCanonical: string;
}

@Component({
  selector: 'app-concept-dedup-modal',
  standalone: true,
  imports: [FormsModule, ButtonModule, Checkbox, DialogModule, ProgressBarModule, RouterLink],
  template: `
    <p-dialog
      [visible]="true"
      [modal]="true"
      [closable]="true"
      [draggable]="false"
      [resizable]="false"
      header="Buscar conceptos duplicados"
      [style]="{ width: '680px', maxHeight: '85vh' }"
      (onHide)="cancel.emit()"
    >
      <div class="modal-body">
        @if (phase() === 'scanning') {
          <div class="scan-phase">
            <p class="scan-label">Analizando conceptos…</p>
            <p-progressbar [value]="scanPercent()" [showValue]="true" styleClass="scan-progress" />
            @if (currentFile()) {
              <p class="current-file">{{ currentFile() }}</p>
            }
            <p class="scan-counter">{{ scanCurrent() }} / {{ scanTotal() }} conceptos</p>
            @if (warnings().length > 0) {
              <div class="warnings-list">
                @for (w of warnings(); track w) {
                  <div class="warning-item">⚠ Sin embedding: {{ w }}</div>
                }
              </div>
            }
          </div>
        }

        @if (phase() === 'error') {
          <div class="error-phase">
            <p class="error-msg">{{ errorMessage() }}</p>
            <p-button label="Reintentar" severity="secondary" size="small" (onClick)="startScan()" />
          </div>
        }

        @if (phase() === 'results') {
          @if (groups().length === 0) {
            <p class="empty-msg">No se encontraron conceptos duplicados.</p>
          } @else {
            <p class="results-desc">
              Se encontraron <strong>{{ groups().length }}</strong> grupo(s) candidato(s) a fusionar.
              Selecciona los que deseas aplicar.
            </p>
            <div class="groups-list">
              @for (group of groups(); track group.canonicalFilename) {
                <div class="group-card" [class.deselected]="!group.selected">
                  <div class="group-header">
                    <p-checkbox
                      [(ngModel)]="group.selected"
                      [binary]="true"
                      (onChange)="groups.update((gs) => [...gs])"
                    />
                    <div class="group-sources">
                      @for (f of group.files; track f) {
                        <span class="file-chip">{{ f }}</span>
                      }
                    </div>
                    <span class="arrow">→</span>
                    <div class="canonical-area">
                      @if (group.editingCanonical) {
                        <input
                          class="canonical-input"
                          [(ngModel)]="group.editedCanonical"
                          (blur)="group.editingCanonical = false; groups.update((gs) => [...gs])"
                          (keydown.enter)="group.editingCanonical = false; groups.update((gs) => [...gs])"
                        />
                      } @else {
                        <span
                          class="canonical-chip"
                          title="Haz clic para editar"
                          (click)="group.editingCanonical = true; groups.update((gs) => [...gs])"
                        >{{ group.editedCanonical }}</span>
                      }
                    </div>
                  </div>
                </div>
              }
            </div>
          }
        }

        @if (phase() === 'confirming') {
          <p class="scan-label">Encolando job de fusión…</p>
        }

        @if (phase() === 'confirmed') {
          <div class="confirmed-phase">
            <p class="success-msg">Job de fusión encolado correctamente. Job #{{ enqueuedJobId() }}.</p>
            <a [routerLink]="['/jobs']" class="history-link" (click)="cancel.emit()">Ver historial de jobs →</a>
          </div>
        }
      </div>

      <ng-template pTemplate="footer">
        <div class="modal-footer">
          <p-button label="Cerrar" severity="secondary" size="small" (onClick)="cancel.emit()" />
          @if (phase() === 'results' && groups().length > 0) {
            <p-button
              [label]="mergeLabel()"
              [disabled]="selectedCount() === 0"
              size="small"
              (onClick)="confirmMerge()"
            />
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
      .scan-phase {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .scan-label {
        margin: 0;
        font-weight: 600;
        font-size: 0.9rem;
      }
      .current-file {
        font-size: 0.8rem;
        font-family: monospace;
        color: var(--app-text-muted);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin: 0;
      }
      .scan-counter {
        font-size: 0.8rem;
        color: var(--app-text-subtle);
        margin: 0;
      }
      .warnings-list {
        max-height: 80px;
        overflow-y: auto;
        margin-top: 4px;
      }
      .warning-item {
        font-size: 0.75rem;
        color: var(--app-warn-text, #b45309);
        font-family: monospace;
      }
      .error-phase {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .error-msg {
        color: var(--app-error-text);
        margin: 0;
        font-size: 0.875rem;
      }
      .results-desc {
        margin: 0 0 12px;
        font-size: 0.875rem;
        color: var(--app-text-muted);
      }
      .groups-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
        max-height: 50vh;
        overflow-y: auto;
      }
      .group-card {
        border: 1px solid var(--app-border);
        border-radius: 8px;
        padding: 10px 14px;
        transition: opacity 0.15s;
      }
      .group-card.deselected {
        opacity: 0.5;
      }
      .group-header {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }
      .group-sources {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }
      .file-chip {
        background: var(--app-surface-subtle);
        border: 1px solid var(--app-border);
        border-radius: 4px;
        padding: 2px 8px;
        font-size: 0.78rem;
        font-family: monospace;
        color: var(--app-text-muted);
      }
      .arrow {
        color: var(--app-text-subtle);
        font-size: 1rem;
        flex-shrink: 0;
      }
      .canonical-area {
        flex: 1;
      }
      .canonical-chip {
        display: inline-block;
        background: var(--app-primary-muted, #dbeafe);
        color: var(--app-primary-dark, #1d4ed8);
        border-radius: 4px;
        padding: 2px 8px;
        font-size: 0.78rem;
        font-family: monospace;
        font-weight: 600;
        cursor: pointer;
        border: 1px solid var(--app-primary-border, #93c5fd);
      }
      .canonical-chip:hover {
        opacity: 0.8;
      }
      .canonical-input {
        border: 1px solid var(--app-border-strong);
        border-radius: 4px;
        padding: 2px 8px;
        font-family: monospace;
        font-size: 0.78rem;
        color: var(--app-text);
        background: var(--app-surface-muted);
        width: 100%;
        box-sizing: border-box;
      }
      .confirmed-phase {
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
      .empty-msg {
        color: var(--app-text-muted);
        font-size: 0.875rem;
      }
      .modal-footer {
        display: flex;
        justify-content: flex-end;
        gap: 10px;
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConceptDedupModalComponent implements OnInit, OnDestroy {
  private readonly api = inject(ApiService);

  readonly cancel = output<void>();

  readonly phase = signal<Phase>('scanning');
  readonly scanCurrent = signal(0);
  readonly scanTotal = signal(0);
  readonly currentFile = signal('');
  readonly warnings = signal<string[]>([]);
  readonly errorMessage = signal('Error al escanear. Inténtalo de nuevo.');
  readonly groups = signal<GroupItem[]>([]);
  readonly enqueuedJobId = signal<string | null>(null);

  readonly scanPercent = computed(() => {
    const total = this.scanTotal();
    return total > 0 ? Math.round((this.scanCurrent() / total) * 100) : 0;
  });

  readonly selectedCount = computed(() => this.groups().filter((g) => g.selected).length);

  readonly mergeLabel = computed(() => {
    const n = this.selectedCount();
    return n === 0 ? 'Fusionar seleccionados' : `Fusionar ${n} grupo${n === 1 ? '' : 's'}`;
  });

  private subscription: Subscription | null = null;

  ngOnInit(): void {
    this.startScan();
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  startScan(): void {
    this.subscription?.unsubscribe();
    this.phase.set('scanning');
    this.scanCurrent.set(0);
    this.scanTotal.set(0);
    this.currentFile.set('');
    this.warnings.set([]);

    this.subscription = this.api.scanConceptDeduplications().subscribe({
      next: (event: ConceptDedupScanEvent) => {
        if (event.type === 'progress') {
          this.scanCurrent.set(event.current);
          this.scanTotal.set(event.total);
          this.currentFile.set(event.message);
        } else if (event.type === 'warning') {
          this.warnings.update((ws) => [...ws, event.path]);
        } else if (event.type === 'completed') {
          const items: GroupItem[] = event.groups.map((g) => ({
            ...g,
            selected: true,
            editingCanonical: false,
            editedCanonical: g.canonicalFilename,
          }));
          this.groups.set(items);
          this.phase.set('results');
        }
      },
      error: (err: Error) => {
        this.errorMessage.set(err.message ?? 'Error al escanear. Inténtalo de nuevo.');
        this.phase.set('error');
      },
    });
  }

  confirmMerge(): void {
    const selected = this.groups()
      .filter((g) => g.selected)
      .map((g) => ({
        canonicalFilename: g.editedCanonical.trim() || g.canonicalFilename,
        files: g.files,
        confidence: g.confidence,
      }));
    if (selected.length === 0) return;

    this.phase.set('confirming');
    this.api.enqueueMerge(selected).subscribe({
      next: (response) => {
        this.enqueuedJobId.set(response.jobId);
        this.phase.set('confirmed');
      },
      error: () => {
        this.errorMessage.set('Error al encolar el job de fusión. Inténtalo de nuevo.');
        this.phase.set('error');
      },
    });
  }
}
