import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { InputText } from 'primeng/inputtext';
import { SelectButton } from 'primeng/selectbutton';
import { TagModule } from 'primeng/tag';
import { ApiService } from '../services/api.service';
import { JobMode } from '../types';

@Component({
  selector: 'app-ingest',
  standalone: true,
  imports: [FormsModule, ButtonModule, InputText, SelectButton, TagModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="ingest">
      <div class="mode-row">
        <span class="label">Mode</span>
        <p-selectButton [options]="modeOptions" [ngModel]="mode()" (ngModelChange)="mode.set($event)" optionLabel="label" optionValue="value" />
        <span class="mode-hint">
          @if (mode() === 'validated') {
            Validated: pauses for guided review before applying connections.
          } @else {
            Unattended: automatically applies discovered connections.
          }
        </span>
      </div>

      <div class="section">
        <div class="section-title">Upload Markdown</div>
        <div class="upload-row">
          <input type="file" accept=".md,.markdown" (change)="onFileChange($event)" class="file-input" #fileInput />
          <button pButton type="button" label="Ingest File" icon="pi pi-upload"
                  [disabled]="!selectedFile() || busy()" (click)="ingestFile(fileInput)"></button>
        </div>
        @if (selectedFile()) {
          <span class="file-name">{{ selectedFile()!.name }}</span>
        }
      </div>

      <div class="section">
        <div class="section-title">Ingest Link</div>
        <div class="url-row">
          <input pInputText type="url" [ngModel]="url()" (ngModelChange)="url.set($event)" placeholder="https://…" class="url-input" />
          <button pButton type="button" label="Ingest URL" icon="pi pi-link"
                  [disabled]="!url().trim() || busy()" (click)="ingestUrl()"></button>
        </div>
      </div>

      @if (lastJobId()) {
        <div class="enqueue-notice">
          Job enqueued: <code>{{ lastJobId() }}</code>
          — watch progress in the Jobs tab.
        </div>
      }
      @if (errorMessage()) {
        <div class="error">{{ errorMessage() }}</div>
      }
    </div>
  `,
  styles: [`
    .ingest { display: grid; gap: 20px; }
    .mode-row { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
    .label { font-weight: 600; color: #5d6878; }
    .mode-hint { font-size: 0.82rem; color: #5d6878; }
    .section { display: grid; gap: 10px; }
    .section-title { font-weight: 600; }
    .upload-row, .url-row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
    .url-input { flex: 1; min-width: 200px; }
    .file-input { flex: 1; }
    .file-name { font-size: 0.82rem; color: #5d6878; font-family: monospace; }
    .enqueue-notice {
      font-size: 0.85rem;
      padding: 10px;
      background: #eff6ff;
      border-radius: 6px;
      border: 1px solid #bfdbfe;
    }
    code { font-family: monospace; font-size: 0.8em; }
    .error { color: #ef4444; font-size: 0.85rem; padding: 8px; background: #fef2f2; border-radius: 4px; }
  `]
})
export class IngestComponent {
  private readonly api = inject(ApiService);

  readonly mode = signal<JobMode>('unattended');
  readonly url = signal('');
  readonly selectedFile = signal<File | null>(null);
  readonly busy = signal(false);
  readonly lastJobId = signal<string | null>(null);
  readonly errorMessage = signal<string | null>(null);

  readonly modeOptions = [
    { label: 'Unattended', value: 'unattended' },
    { label: 'Validated', value: 'validated' },
  ];

  onFileChange(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.selectedFile.set(input.files?.[0] ?? null);
  }

  ingestFile(fileInput: HTMLInputElement): void {
    const file = this.selectedFile();
    if (!file) return;
    this.busy.set(true);
    this.errorMessage.set(null);
    this.api.uploadMarkdown(file, this.mode()).subscribe({
      next: res => {
        this.lastJobId.set(res.jobId);
        this.selectedFile.set(null);
        fileInput.value = '';
        this.busy.set(false);
      },
      error: err => {
        this.errorMessage.set(err.message ?? 'Upload failed');
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
      next: res => {
        this.lastJobId.set(res.jobId);
        this.url.set('');
        this.busy.set(false);
      },
      error: err => {
        this.errorMessage.set(err.message ?? 'Ingest failed');
        this.busy.set(false);
      },
    });
  }
}
