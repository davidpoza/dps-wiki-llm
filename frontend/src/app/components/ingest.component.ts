import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { SelectButton } from 'primeng/selectbutton';
import { TagModule } from 'primeng/tag';
import { TextareaModule } from 'primeng/textarea';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { ApiService } from '../services/api.service';
import { JobMode } from '../types';

@Component({
  selector: 'app-ingest',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputText, SelectButton, TagModule, TextareaModule, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ingest">
      <div class="mode-row">
        <span class="label">{{ 'ingest.mode' | transloco }}</span>
        <p-selectButton
          [options]="modeOptions()"
          [ngModel]="mode()"
          (ngModelChange)="mode.set($event)"
          optionLabel="label"
          optionValue="value"
        />
        <span class="mode-hint">
          @if (mode() === 'validated') {
            {{ 'ingest.modeValidated' | transloco }}
          } @else {
            {{ 'ingest.modeUnattended' | transloco }}
          }
        </span>
      </div>

      <div class="section">
        <div class="section-title">
          {{ 'ingest.uploadFile' | transloco }} <span class="section-hint">{{ 'ingest.uploadHint' | transloco }}</span>
        </div>
        <div class="upload-row">
          <input
            type="file"
            accept=".pdf,.md,.markdown"
            (change)="onFileChange($event)"
            class="file-input"
            #fileInput
          />
          <button
            pButton
            type="button"
            [label]="'ingest.ingestFile' | transloco"
            icon="pi pi-upload"
            [disabled]="!selectedFile() || busy()"
            (click)="ingestFile(fileInput)"
          ></button>
        </div>
        @if (selectedFile()) {
          <span class="file-name">{{ selectedFile()!.name }}</span>
        }
      </div>

      <div class="section">
        <div class="section-title">{{ 'ingest.ingestLink' | transloco }}</div>
        <div class="url-row">
          <input
            pInputText
            type="url"
            [ngModel]="url()"
            (ngModelChange)="url.set($event)"
            [placeholder]="'ingest.urlPlaceholder' | transloco"
            class="url-input"
          />
          <button
            pButton
            type="button"
            [label]="'ingest.ingestUrl' | transloco"
            icon="pi pi-link"
            [disabled]="!url().trim() || busy()"
            (click)="ingestUrl()"
          ></button>
        </div>
      </div>

      <div class="section">
        <div class="section-title">{{ 'ingest.pasteMarkdown' | transloco }}</div>
        <input
          pInputText
          type="text"
          [ngModel]="mdTitle()"
          (ngModelChange)="mdTitle.set($event)"
          [placeholder]="'ingest.pasteTitlePlaceholder' | transloco"
          class="url-input"
        />
        <textarea
          pTextarea
          [ngModel]="mdText()"
          (ngModelChange)="mdText.set($event)"
          [placeholder]="'ingest.pastePlaceholder' | transloco"
          rows="8"
          class="md-textarea"
        ></textarea>
        @if (mdTooLarge()) {
          <span class="size-warning">{{ 'ingest.textTooLarge' | transloco }}</span>
        }
        <div>
          <button
            pButton
            type="button"
            [label]="'ingest.ingestText' | transloco"
            icon="pi pi-clipboard"
            [disabled]="!mdText().trim() || mdTooLarge() || busy()"
            (click)="ingestMdText()"
          ></button>
        </div>
      </div>

      @if (lastJobId()) {
        <div class="enqueue-notice">
          {{ 'ingest.jobEnqueued' | transloco: { id: lastJobId() } }}
        </div>
      }
      @if (errorMessage()) {
        <div class="error">{{ errorMessage() }}</div>
      }
    </div>
  `,
  styles: [
    `
      .ingest {
        display: grid;
        gap: 20px;
      }
      .mode-row {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 12px;
      }
      .label {
        font-weight: 600;
        color: var(--app-text-muted);
      }
      .mode-hint {
        font-size: 0.82rem;
        color: var(--app-text-muted);
      }
      .section-hint {
        font-size: 0.78rem;
        font-weight: 400;
        color: var(--app-text-subtle);
        margin-left: 6px;
      }
      .section {
        display: grid;
        gap: 10px;
      }
      .section-title {
        font-weight: 600;
      }
      .upload-row,
      .url-row {
        display: flex;
        gap: 10px;
        align-items: center;
        flex-wrap: wrap;
      }
      .url-input {
        flex: 1;
        min-width: 200px;
      }
      .file-input {
        flex: 1;
      }
      .file-name {
        font-size: 0.82rem;
        color: var(--app-text-muted);
        font-family: monospace;
      }
      .enqueue-notice {
        font-size: 0.85rem;
        padding: 10px;
        background: var(--app-primary-soft);
        border-radius: 6px;
        border: 1px solid var(--app-primary);
      }
      code {
        font-family: monospace;
        font-size: 0.8em;
      }
      .error {
        color: var(--app-error-text);
        font-size: 0.85rem;
        padding: 8px;
        background: var(--app-error-bg);
        border-radius: 4px;
      }
      .md-textarea {
        width: 100%;
        font-family: monospace;
        font-size: 0.85rem;
        resize: vertical;
      }
      .size-warning {
        font-size: 0.82rem;
        color: var(--app-error-text);
      }
    `,
  ],
})
export class IngestComponent {
  private readonly api = inject(ApiService);
  private readonly t = inject(TranslocoService);

  readonly mode = signal<JobMode>('unattended');
  readonly url = signal('');
  readonly selectedFile = signal<File | null>(null);
  readonly mdText = signal('');
  readonly mdTitle = signal('');
  readonly busy = signal(false);
  readonly lastJobId = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  readonly mdTooLarge = computed(() => new TextEncoder().encode(this.mdText()).length > 2_097_152);

  readonly modeOptions = computed(() => [
    { label: this.t.translate('ingest.modeOptions.unattended'), value: 'unattended' },
    { label: this.t.translate('ingest.modeOptions.validated'), value: 'validated' },
  ]);

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile.set(input.files?.[0] ?? null);
  }

  ingestFile(fileInput: HTMLInputElement): void {
    const file = this.selectedFile();
    if (!file) return;
    this.busy.set(true);
    this.errorMessage.set(null);
    this.api.uploadFile(file, this.mode()).subscribe({
      next: (res) => {
        this.lastJobId.set(res.jobId);
        this.selectedFile.set(null);
        fileInput.value = '';
        this.busy.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.message ?? this.t.translate('ingest.uploadFailed'));
        this.busy.set(false);
      },
    });
  }

  ingestMdText(): void {
    const content = this.mdText().trim();
    if (!content || this.mdTooLarge()) return;
    this.busy.set(true);
    this.errorMessage.set(null);
    this.api.ingestText(content, this.mdTitle().trim(), this.mode()).subscribe({
      next: (res) => {
        this.lastJobId.set(res.jobId);
        this.mdText.set('');
        this.mdTitle.set('');
        this.busy.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.message ?? this.t.translate('ingest.ingestFailed'));
        this.busy.set(false);
      },
    });
  }

  ingestUrl(): void {
    const url = this.url().trim();
    if (!url) return;
    this.busy.set(true);
    this.errorMessage.set(null);
    this.api.enqueueIngestUrl(url, this.mode()).subscribe({
      next: (res) => {
        this.lastJobId.set(res.jobId);
        this.url.set('');
        this.busy.set(false);
      },
      error: (err) => {
        this.errorMessage.set(err.message ?? this.t.translate('ingest.ingestFailed'));
        this.busy.set(false);
      },
    });
  }
}
