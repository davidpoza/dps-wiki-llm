import { ChangeDetectionStrategy, ChangeDetectorRef, Component, effect, inject, input, model } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ApiService } from '../services/api.service';

@Component({
  selector: 'app-link-explain-modal',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ButtonModule, DialogModule, ProgressSpinnerModule],
  template: `
    <p-dialog
      [visible]="visible()"
      [modal]="true"
      [closable]="true"
      [draggable]="false"
      [resizable]="false"
      [header]="dialogHeader()"
      [style]="{ width: '560px' }"
      (onHide)="visible.set(false)"
    >
      <div class="link-explain-body">
        @if (loading) {
          <div class="link-explain-spinner">
            <p-progressSpinner strokeWidth="4" [style]="{ width: '40px', height: '40px' }" />
          </div>
        } @else if (errorMsg) {
          <p class="link-explain-error">{{ errorMsg }}</p>
        } @else {
          <p class="link-explain-text">{{ explanation }}</p>
        }
      </div>
    </p-dialog>
  `,
  styles: [
    `
      .link-explain-body {
        min-height: 80px;
        padding: 0.5rem 0;
      }
      .link-explain-spinner {
        display: flex;
        justify-content: center;
        align-items: center;
        padding: 1rem 0;
      }
      .link-explain-text {
        white-space: pre-wrap;
        line-height: 1.6;
        margin: 0;
      }
      .link-explain-error {
        color: var(--red-500, #ef4444);
        margin: 0;
      }
    `,
  ],
})
export class LinkExplainModalComponent {
  readonly visible = model<boolean>(false);
  readonly sourcePath = input<string | null>(null);
  readonly targetPath = input<string | null>(null);

  loading = false;
  explanation = '';
  errorMsg = '';

  private readonly api = inject(ApiService);
  private readonly cdr = inject(ChangeDetectorRef);

  constructor() {
    effect(() => {
      if (this.visible()) {
        this.fetchExplanation();
      } else {
        this.explanation = '';
        this.errorMsg = '';
        this.loading = false;
      }
    });
  }

  dialogHeader(): string {
    const src = shortName(this.sourcePath());
    const tgt = shortName(this.targetPath());
    if (src && tgt) return `${src} → ${tgt}`;
    return 'Relación entre notas';
  }

  private fetchExplanation(): void {
    const src = this.sourcePath();
    const tgt = this.targetPath();
    if (!src || !tgt) {
      this.errorMsg = 'La nota enlazada no existe.';
      this.cdr.markForCheck();
      return;
    }

    this.loading = true;
    this.explanation = '';
    this.errorMsg = '';
    this.cdr.markForCheck();

    this.api.explainLink(src, tgt).subscribe({
      next: (res) => {
        this.explanation = res.explanation;
        this.loading = false;
        this.cdr.markForCheck();
      },
      error: (err: HttpErrorResponse) => {
        this.errorMsg =
          err.status === 404 ? 'La nota enlazada no existe.' : 'No se pudo obtener la explicación. Inténtalo de nuevo.';
        this.loading = false;
        this.cdr.markForCheck();
      },
    });
  }
}

function shortName(path: string | null | undefined): string {
  if (!path) return '';
  let name = path;
  const slash = name.lastIndexOf('/');
  if (slash >= 0) name = name.substring(slash + 1);
  if (name.endsWith('.md')) name = name.substring(0, name.length - 3);
  return name;
}
