import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  OnDestroy,
  signal,
  computed,
  ViewChild,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { parse as parseYaml } from 'yaml';
import { Editor, defaultValueCtx, editorViewCtx, editorViewOptionsCtx, rootCtx } from '@milkdown/core';
import { replaceAll } from '@milkdown/utils';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { ConfirmationService, MessageService } from 'primeng/api';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { FileService } from '../services/file.service';
import { ThemeService } from '../services/theme.service';
import { AuthService } from '../services/auth.service';
import { ApiService } from '../services/api.service';
import { createObsidianImagePreviewPlugin, OBSIDIAN_IMAGE_PREVIEW_REFRESH } from './obsidian-image-preview.plugin';

@Component({
  selector: 'app-document-viewer',
  standalone: true,
  imports: [ButtonModule, ConfirmDialogModule, ToastModule, TranslocoPipe],
  providers: [ConfirmationService, MessageService],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="viewer-shell">
      <header class="topbar">
        <div class="brand">
          <h1>{{ 'common.brand' | transloco }}</h1>
        </div>
        <div class="topbar-actions">
          <p-button
            severity="secondary"
            [icon]="theme.isDark() ? 'pi pi-sun' : 'pi pi-moon'"
            [rounded]="true"
            [text]="true"
            size="small"
            (onClick)="theme.toggle()"
          />
          <p-button severity="secondary" [label]="'common.home' | transloco" size="small" (onClick)="goHome()" />
          @if (auth.isLoggedIn()) {
            <p-button severity="danger" icon="pi pi-trash" [label]="'viewer.delete' | transloco" size="small" (onClick)="confirmDelete()" />
          }
        </div>
      </header>

      <div class="viewer-content">
        @if (errorMessage()) {
          <div class="viewer-error">
            <i class="pi pi-exclamation-triangle"></i>
            <span>{{ errorMessage() }}</span>
          </div>
        } @else if (loading()) {
          <div class="viewer-loading">
            <i class="pi pi-spin pi-spinner"></i>
          </div>
        } @else {
          <div class="viewer-body">
            @if (pathParts(); as parts) {
              <h2 class="viewer-filename" [title]="filePath()">
                @if (parts.dir) {
                  <span class="viewer-path-dir">{{ parts.dir }}</span>
                }
                <span class="viewer-path-name">{{ parts.name }}</span>
              </h2>
            }
            @if (frontmatterEntries().length > 0) {
              <div class="viewer-frontmatter">
                @for (entry of frontmatterEntries(); track entry[0]) {
                  <div class="fm-entry">
                    <span class="fm-key">{{ entry[0] }}</span>
                    <span class="fm-value">{{ formatValue(entry[1]) }}</span>
                  </div>
                }
              </div>
            }
            <div #editorContainer class="milkdown-container"></div>
          </div>
        }
      </div>
    </main>
    <p-confirmdialog />
    <p-toast />
  `,
  styles: [`
    :host { display: block; height: 100vh; overflow: hidden; }
    .viewer-shell {
      height: 100vh;
      overflow: hidden;
      background: var(--app-bg);
      color: var(--app-text);
      display: flex;
      flex-direction: column;
    }
    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 24px;
      border-bottom: 1px solid var(--app-border);
      background: var(--app-surface);
      flex-shrink: 0;
    }
    .topbar-actions { display: flex; gap: 8px; align-items: center; }
    .brand h1 { margin: 0; font-size: 1.3rem; }
    .viewer-content {
      flex: 1;
      overflow-y: auto;
      padding: 32px;
      max-width: 860px;
      margin: 0 auto;
      width: 100%;
    }
    .viewer-error {
      display: flex;
      align-items: center;
      gap: 10px;
      color: var(--app-error-text, #dc2626);
      font-size: 1rem;
      padding: 24px 0;
    }
    .viewer-loading {
      display: flex;
      justify-content: center;
      padding: 48px 0;
      color: var(--app-text-muted);
      font-size: 1.5rem;
    }
    .viewer-filename {
      margin: 0 0 12px;
      font-size: 1.5rem;
      font-weight: 700;
      color: var(--app-text);
      overflow-wrap: anywhere;
      word-break: break-word;
    }
    .viewer-path-dir {
      font-weight: 400;
      color: var(--app-text-muted);
    }
    .viewer-path-name {
      font-weight: 700;
      color: var(--app-text);
    }
    .viewer-frontmatter {
      background: var(--app-surface-subtle);
      border: 1px solid var(--app-border);
      border-radius: 6px;
      padding: 10px 16px;
      margin-bottom: 24px;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .fm-entry { display: flex; gap: 8px; align-items: baseline; font-size: 0.85rem; }
    .fm-key { font-weight: 600; color: var(--app-text-muted); }
    .fm-value { color: var(--app-text); }
    .milkdown-container { outline: none; }
    :host ::ng-deep .milkdown { outline: none; }
    :host ::ng-deep .milkdown .editor { outline: none; pointer-events: none; user-select: text; }
    :host ::ng-deep .milkdown a { color: var(--app-primary); text-decoration: underline; }
    :host ::ng-deep .milkdown h1 { font-size: 2em; font-weight: 700; margin: 0.5em 0 0.3em; }
    :host ::ng-deep .milkdown h2 { font-size: 1.5em; font-weight: 700; margin: 0.6em 0 0.3em; }
    :host ::ng-deep .milkdown h3 { font-size: 1.25em; font-weight: 600; margin: 0.7em 0 0.3em; }
    :host ::ng-deep .milkdown blockquote {
      border-left: 4px solid var(--app-primary);
      margin: 0.75em 0;
      padding: 0.4em 1em;
      background: var(--app-primary-soft);
      border-radius: 0 4px 4px 0;
    }
    :host ::ng-deep .milkdown ul { list-style: disc; padding-left: 1.75em; margin: 0.5em 0; }
    :host ::ng-deep .milkdown ol { list-style: decimal; padding-left: 1.75em; margin: 0.5em 0; }
    :host ::ng-deep .milkdown li { margin: 0.2em 0; }
    :host ::ng-deep .milkdown pre {
      background: var(--app-surface-subtle);
      border-radius: 6px;
      padding: 0.9em 1em;
      overflow-x: auto;
      margin: 0.75em 0;
    }
    :host ::ng-deep .milkdown code {
      font-family: 'Fira Code', 'Cascadia Code', monospace;
      font-size: 0.85em;
      background: var(--app-surface-subtle);
      padding: 0.15em 0.35em;
      border-radius: 3px;
    }
    :host ::ng-deep .milkdown table {
      border-collapse: collapse;
      width: 100%;
      margin: 1em 0;
    }
    :host ::ng-deep .milkdown table th,
    :host ::ng-deep .milkdown table td {
      border: 1px solid var(--app-border);
      padding: 0.45em 0.75em;
    }
    :host ::ng-deep .milkdown table thead th {
      background: var(--app-surface-subtle);
      font-weight: 600;
    }
    :host ::ng-deep .obsidian-image-embed-hidden { display: none; }
    :host ::ng-deep .obsidian-image-preview {
      margin: 18px auto;
      max-width: min(100%, 860px);
      padding: 10px;
      border: 1px solid var(--app-border);
      border-radius: 8px;
      background: var(--app-surface-subtle);
      box-shadow: 0 1px 4px rgba(15, 23, 42, 0.08);
    }
    :host ::ng-deep .obsidian-image-preview img {
      display: block;
      width: 100%;
      max-height: 70vh;
      object-fit: contain;
      border-radius: 5px;
    }
    :host ::ng-deep .obsidian-image-preview.is-error {
      color: var(--app-error-text);
      font-size: 0.875rem;
      text-align: center;
    }
  `],
})
export class DocumentViewerComponent implements AfterViewInit, OnDestroy {
  @ViewChild('editorContainer') editorContainer!: ElementRef<HTMLDivElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fileService = inject(FileService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly messageService = inject(MessageService);
  private readonly t = inject(TranslocoService);
  readonly auth = inject(AuthService);
  private readonly api = inject(ApiService);
  readonly theme = inject(ThemeService);

  readonly filePath = signal<string | null>(null);
  readonly loading = signal(true);
  readonly errorMessage = signal<string | null>(null);
  readonly frontmatter = signal<Record<string, unknown>>({});
  readonly frontmatterEntries = computed(() => Object.entries(this.frontmatter()));
  readonly resourceFolder = signal('');
  readonly pathParts = computed(() => {
    const path = this.filePath();
    if (!path) return null;
    const idx = path.lastIndexOf('/');
    return idx === -1
      ? { dir: '', name: path }
      : { dir: path.slice(0, idx + 1), name: path.slice(idx + 1) };
  });

  private editor: Editor | null = null;

  ngAfterViewInit(): void {
    const segments = this.route.snapshot.url;
    const path = segments.slice(1).map(s => s.path).join('/');
    if (!path) {
      this.loading.set(false);
      this.errorMessage.set('No file specified');
      this.cdr.markForCheck();
      return;
    }
    this.filePath.set(path);
    this.loadResourceSettings();
    this.initEditor().then(() => this.loadFile(path));
  }

  ngOnDestroy(): void {
    this.editor?.destroy();
  }

  private initEditor(): Promise<void> {
    return Editor.make()
      .config(ctx => {
        ctx.set(rootCtx, this.editorContainer.nativeElement);
        ctx.set(defaultValueCtx, '');
        ctx.set(editorViewOptionsCtx, {
          attributes: { spellcheck: 'false' },
          editable: () => false,
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(createObsidianImagePreviewPlugin({
        getResourceFolder: () => this.resourceFolder(),
        getToken: () => this.auth.token(),
      }))
      .create()
      .then(editor => {
        this.editor = editor;
      });
  }

  private loadResourceSettings(): void {
    this.api.getResourceSettings().subscribe({
      next: settings => {
        this.resourceFolder.set(settings.resourceFolder);
        this.refreshObsidianImagePreview();
      },
      error: () => {},
    });
  }

  private refreshObsidianImagePreview(): void {
    if (!this.editor) return;
    this.editor.action(ctx => {
      const view = ctx.get(editorViewCtx);
      view.dispatch(view.state.tr.setMeta(OBSIDIAN_IMAGE_PREVIEW_REFRESH, true));
    });
  }

  private parseFrontmatter(raw: string): { data: Record<string, unknown>; content: string } {
    const input = raw.startsWith('﻿') ? raw.slice(1) : raw;
    const match = input.match(/^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/);
    if (!match) return { data: {}, content: input };
    try {
      const data = (parseYaml(match[1]) ?? {}) as Record<string, unknown>;
      return { data, content: match[2] };
    } catch {
      return { data: {}, content: match[2] };
    }
  }

  private loadFile(path: string): void {
    this.fileService.getContent(path).subscribe({
      next: rawContent => {
        const { data, content } = this.parseFrontmatter(rawContent);
        this.frontmatter.set(data);
        this.loading.set(false);
        if (this.editor) {
          this.editor.action(replaceAll(content));
        }
        this.cdr.markForCheck();
      },
      error: err => {
        this.loading.set(false);
        this.errorMessage.set(
          err?.status === 404 ? `Document not found: ${path}` : `Error loading document: ${path}`
        );
        this.cdr.markForCheck();
      },
    });
  }

  formatValue(value: unknown): string {
    if (Array.isArray(value)) return value.join(', ');
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value ?? '');
  }

  goHome(): void {
    this.router.navigateByUrl('/');
  }

  confirmDelete(): void {
    const path = this.filePath();
    if (!path) return;
    const fileName = path.slice(path.lastIndexOf('/') + 1);
    this.confirmationService.confirm({
      message: this.t.translate('viewer.deleteConfirmMessage', { name: fileName }),
      header: this.t.translate('viewer.deleteConfirmHeader'),
      icon: 'pi pi-trash',
      accept: () => {
        this.fileService.deleteFile(path).subscribe({
          next: () => this.router.navigateByUrl('/'),
          error: () =>
            this.messageService.add({
              severity: 'error',
              summary: this.t.translate('common.error'),
              detail: this.t.translate('viewer.deleteError'),
            }),
        });
      },
    });
  }
}
