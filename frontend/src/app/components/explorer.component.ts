import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  signal,
  ViewChild,
} from '@angular/core';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { Router } from '@angular/router';
import { Editor, defaultValueCtx, editorViewOptionsCtx, rootCtx } from '@milkdown/core';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { commonmark } from '@milkdown/preset-commonmark';
import { replaceAll } from '@milkdown/utils';
import { TreeNode, ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { ToolbarModule } from 'primeng/toolbar';
import { TreeModule } from 'primeng/tree';
import { Subscription } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { FileService } from '../services/file.service';

@Component({
  selector: 'app-explorer',
  standalone: true,
  imports: [TreeModule, ButtonModule, ToastModule, ConfirmDialogModule, ToolbarModule, DialogModule, InputTextModule],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast />
    <p-confirmDialog />

    <main class="explorer-shell">
      <header class="topbar">
        <div class="brand">
          <h1>DPS Wiki</h1>
          <p>Explorer</p>
        </div>
        <div class="topbar-actions">
          <p-button severity="secondary" label="Home" size="small" (onClick)="goHome()" />
          <p-button severity="secondary" label="Sign out" size="small" (onClick)="logout()" />
        </div>
      </header>

      <div class="explorer-layout">
        <nav class="sidebar-toolbar">
          <p-button
            icon="pi pi-search"
            [text]="true"
            severity="secondary"
            size="small"
            title="Buscar fichero"
            (onClick)="openSearch()"
          />
          <p-button
            [icon]="treePanelCollapsed() ? 'pi pi-chevron-right' : 'pi pi-chevron-left'"
            [text]="true"
            severity="secondary"
            size="small"
            [title]="treePanelCollapsed() ? 'Expandir panel' : 'Colapsar panel'"
            (onClick)="toggleTreePanel()"
          />
        </nav>

        <aside
          class="file-tree-panel"
          [class.collapsed]="treePanelCollapsed()"
          [style.width.px]="treePanelCollapsed() ? 0 : treePanelWidth()"
        >
          <p-tree
            [value]="treeNodes()"
            selectionMode="single"
            [(selection)]="selectedNode"
            (onNodeSelect)="onNodeSelect($event)"
            styleClass="w-full"
          >
            <ng-template pTemplate="default" let-node>
              <span class="tree-label" [title]="node.label">{{ node.label }}</span>
            </ng-template>
          </p-tree>
          @if (treeNodes().length === 0) {
            <p class="empty-msg">No hay documentos</p>
          }
        </aside>

        <div
          class="resizer"
          [class.active]="isResizing"
          (mousedown)="onResizerMouseDown($event)"
        ></div>

        <section class="editor-panel">
          @if (selectedPath()) {
            <div class="editor-header">
              <span class="file-title">{{ selectedLabel() }}{{ isDirty() ? ' *' : '' }}</span>
              <p-button
                label="Guardar"
                size="small"
                [disabled]="!isDirty()"
                (onClick)="save()"
              />
            </div>
            @if (frontmatterEntries().length > 0) {
              <div class="frontmatter-panel">
                <div class="frontmatter-header">
                  <span class="frontmatter-title">Metadatos</span>
                  <div class="fm-actions">
                    <button class="fm-toggle" (click)="toggleFrontmatterEdit()" [class.active]="editingFrontmatter()">
                      {{ editingFrontmatter() ? '✓ Vista' : '✎ Editar' }}
                    </button>
                    <button class="fm-toggle" (click)="toggleFrontmatter()">
                      {{ showFrontmatter() ? '▲' : '▼' }}
                    </button>
                  </div>
                </div>
                @if (showFrontmatter()) {
                  @if (editingFrontmatter()) {
                    <div class="fm-editor">
                      <textarea
                        class="fm-yaml-textarea"
                        [class.error]="frontmatterYamlError()"
                        [value]="frontmatterRawYaml()"
                        (input)="onFrontmatterYamlChange($any($event.target).value)"
                        spellcheck="false"
                      ></textarea>
                      @if (frontmatterYamlError()) {
                        <span class="fm-yaml-error">YAML inválido</span>
                      }
                    </div>
                  } @else {
                    <div class="frontmatter-entries">
                      @for (entry of frontmatterEntries(); track entry[0]) {
                        <div class="fm-entry">
                          <span class="fm-key">{{ entry[0] }}</span>
                          <span class="fm-value">{{ formatFmValue(entry[1]) }}</span>
                        </div>
                      }
                    </div>
                  }
                }
              </div>
            }
          }
          <div #editorContainer class="milkdown-container" [class.hidden]="!selectedPath()"></div>
          @if (!selectedPath()) {
            <div class="placeholder">Selecciona un fichero para editarlo</div>
          }
        </section>
      </div>
    </main>

    <p-dialog
      header="Buscar fichero"
      [(visible)]="showSearch"
      [modal]="true"
      [draggable]="false"
      [style]="{ width: '480px' }"
      (onShow)="searchInput.focus()"
    >
      <div class="search-box">
        <input
          #searchInput
          pInputText
          type="text"
          placeholder="Nombre del fichero..."
          class="w-full"
          [value]="searchQuery()"
          (input)="searchQuery.set($any($event.target).value)"
        />
      </div>
      <div class="search-results">
        @if (filteredFiles().length === 0) {
          <p class="search-empty">Sin resultados</p>
        }
        @for (file of filteredFiles(); track file.data) {
          <div class="search-result" (click)="selectFromSearch(file)">
            <i class="pi pi-file"></i>
            <span [innerHTML]="file.label"></span>
          </div>
        }
      </div>
    </p-dialog>
  `,
  styles: [`
    :host {
      display: block;
      height: 100vh;
      overflow: hidden;
    }
    .explorer-shell {
      height: 100vh;
      overflow: hidden;
      background: #f6f7f9;
      color: #18212f;
      display: flex;
      flex-direction: column;
    }
    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 12px 24px;
      border-bottom: 1px solid #e2e5ea;
      background: #fff;
    }
    .topbar-actions { display: flex; gap: 8px; align-items: center; }
    .brand h1 { margin: 0; font-size: 1.3rem; }
    .brand p { margin: 2px 0 0; font-size: 0.8rem; color: #5d6878; }
    .explorer-layout {
      display: flex;
      flex: 1;
      overflow: hidden;
      height: calc(100vh - 62px);
    }
    .file-tree-panel {
      flex-shrink: 0;
      border-right: none;
      background: #fff;
      overflow-y: auto;
      overflow-x: hidden;
      padding: 8px;
      transition: width 0.2s ease;
    }
    .file-tree-panel.collapsed {
      padding: 0;
      overflow: hidden;
    }
    .sidebar-toolbar {
      flex-shrink: 0;
      width: 40px;
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 6px 0;
      gap: 2px;
      border-right: 1px solid #e2e5ea;
      background: #fafbfc;
    }
    .resizer {
      flex-shrink: 0;
      width: 5px;
      background: #e2e5ea;
      cursor: col-resize;
      transition: background 0.15s;
    }
    .resizer:hover, .resizer.active {
      background: #a0aec0;
    }
    .search-box {
      margin-bottom: 12px;
    }
    .search-box input {
      width: 100%;
    }
    .search-results {
      max-height: 360px;
      overflow-y: auto;
    }
    .search-result {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 8px 10px;
      border-radius: 4px;
      cursor: pointer;
      font-size: 0.875rem;
      color: #18212f;
      transition: background 0.1s;
    }
    .search-result:hover {
      background: #f0f4f8;
    }
    .search-result .pi {
      color: #5d6878;
      font-size: 0.8rem;
    }
    .search-empty {
      text-align: center;
      color: #5d6878;
      font-size: 0.875rem;
      padding: 24px 0;
    }
    .tree-label {
      display: block;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 100%;
    }
    :host ::ng-deep .file-tree-panel .p-tree-node-label {
      overflow: hidden;
      min-width: 0;
      flex: 1;
    }
    .empty-msg { color: #5d6878; font-size: 0.85rem; padding: 8px; }
    .editor-panel {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    .editor-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 8px 16px;
      border-bottom: 1px solid #e2e5ea;
      background: #fff;
    }
    .file-title { font-size: 0.9rem; font-weight: 500; }
    .milkdown-container {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      background: #fff;
    }
    .milkdown-container.hidden { display: none; }
    .placeholder {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #5d6878;
      font-size: 0.95rem;
    }
    :host ::ng-deep .milkdown { outline: none; min-height: 100%; }
    :host ::ng-deep .milkdown .editor { outline: none; min-height: 400px; }
    .frontmatter-panel {
      background: #f0f4f8;
      border-bottom: 1px solid #d1d9e0;
      padding: 0;
    }
    .frontmatter-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 6px 16px;
    }
    .frontmatter-title {
      font-size: 0.75rem;
      font-weight: 600;
      color: #5d6878;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .fm-actions { display: flex; gap: 4px; align-items: center; }
    .fm-toggle {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 0.75rem;
      color: #5d6878;
      padding: 2px 6px;
      border-radius: 3px;
    }
    .fm-toggle:hover { background: #e2e5ea; color: #18212f; }
    .fm-toggle.active { background: #e2e5ea; color: #18212f; }
    .frontmatter-entries {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 4px 16px 10px;
    }
    .fm-entry { display: flex; gap: 6px; align-items: baseline; }
    .fm-key {
      font-size: 0.75rem;
      font-weight: 600;
      color: #5d6878;
    }
    .fm-value {
      font-size: 0.8rem;
      color: #18212f;
    }
    .fm-editor { padding: 4px 16px 10px; }
    .fm-yaml-textarea {
      width: 100%;
      min-height: 100px;
      font-family: 'Fira Code', 'Cascadia Code', monospace;
      font-size: 0.8rem;
      line-height: 1.5;
      padding: 8px;
      border: 1px solid #d1d9e0;
      border-radius: 4px;
      resize: vertical;
      background: #fff;
      color: #18212f;
      outline: none;
    }
    .fm-yaml-textarea:focus { border-color: #6366f1; }
    .fm-yaml-textarea.error { border-color: #ef4444; }
    .fm-yaml-error {
      display: block;
      font-size: 0.75rem;
      color: #ef4444;
      margin-top: 4px;
    }
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExplorerComponent implements AfterViewInit, OnDestroy {
  @ViewChild('editorContainer') editorContainer!: ElementRef<HTMLDivElement>;

  private readonly fileService = inject(FileService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly cdr = inject(ChangeDetectorRef);

  readonly treeNodes = signal<TreeNode[]>([]);
  readonly selectedPath = signal<string | null>(null);
  readonly selectedLabel = signal<string>('');
  readonly isDirty = signal(false);
  readonly frontmatter = signal<Record<string, unknown>>({});
  readonly frontmatterEntries = computed(() => Object.entries(this.frontmatter()));
  readonly showFrontmatter = signal(true);
  readonly editingFrontmatter = signal(false);
  readonly frontmatterRawYaml = signal('');
  readonly frontmatterYamlError = signal(false);
  readonly treePanelWidth = signal(280);
  readonly treePanelCollapsed = signal(false);
  readonly showSearch = signal(false);
  readonly searchQuery = signal('');

  readonly allFiles = computed(() => {
    const flatten = (nodes: TreeNode[]): TreeNode[] =>
      nodes.flatMap(n => n.leaf ? [n] : flatten(n.children ?? []));
    return flatten(this.treeNodes());
  });

  readonly filteredFiles = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    return q ? this.allFiles().filter(n => n.label?.toLowerCase().includes(q)) : this.allFiles();
  });

  selectedNode: TreeNode | null = null;

  private editor: Editor | null = null;
  private currentMarkdown = '';
  private isLoading = false;
  private treeSubscription: Subscription | null = null;
  protected isResizing = false;
  private resizeStartX = 0;
  private resizeStartWidth = 0;

  ngAfterViewInit(): void {
    this.loadTree();
    this.initEditor();
  }

  ngOnDestroy(): void {
    this.treeSubscription?.unsubscribe();
    this.editor?.destroy();
  }

  private loadTree(): void {
    this.treeSubscription = this.fileService.getTree().subscribe({
      next: nodes => {
        this.treeNodes.set(nodes);
        this.cdr.markForCheck();
      },
      error: () =>
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el árbol de ficheros' }),
    });
  }

  private initEditor(): void {
    Editor.make()
      .config(ctx => {
        ctx.set(rootCtx, this.editorContainer.nativeElement);
        ctx.set(defaultValueCtx, '');
        ctx.set(editorViewOptionsCtx, { attributes: { spellcheck: 'false' } });
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
          if (this.isLoading) {
            this.isLoading = false;
            this.currentMarkdown = markdown;
            return;
          }
          if (this.selectedPath() && markdown !== this.currentMarkdown) {
            this.isDirty.set(true);
            this.cdr.markForCheck();
          }
          this.currentMarkdown = markdown;
        });
      })
      .use(commonmark)
      .use(listener)
      .create()
      .then(editor => {
        this.editor = editor;
      });
  }

  onNodeSelect(event: { node: TreeNode }): void {
    const node = event.node;
    if (!node.leaf) return;

    if (this.isDirty()) {
      this.confirmationService.confirm({
        message: 'Hay cambios sin guardar. ¿Descartar y abrir el fichero seleccionado?',
        header: 'Cambios sin guardar',
        icon: 'pi pi-exclamation-triangle',
        accept: () => this.loadFile(node),
        reject: () => {
          this.selectedNode = null;
        },
      });
    } else {
      this.loadFile(node);
    }
  }

  private parseFrontmatter(raw: string): { data: Record<string, unknown>; content: string } {
    const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
    if (!match) return { data: {}, content: raw };
    try {
      const data = (parseYaml(match[1]) ?? {}) as Record<string, unknown>;
      return { data, content: match[2] };
    } catch {
      return { data: {}, content: raw };
    }
  }

  private stringifyWithFrontmatter(body: string, data: Record<string, unknown>): string {
    return `---\n${stringifyYaml(data)}---\n\n${body}`;
  }

  private loadFile(node: TreeNode): void {
    const path = node.data as string;
    this.fileService.getContent(path).subscribe({
      next: rawContent => {
        const parsed = this.parseFrontmatter(rawContent);
        this.selectedPath.set(path);
        this.selectedLabel.set(node.label ?? path);
        this.isDirty.set(false);
        this.frontmatter.set(parsed.data);
        this.editingFrontmatter.set(false);
        this.frontmatterYamlError.set(false);
        this.currentMarkdown = parsed.content;
        if (this.editor) {
          this.isLoading = true;
          this.editor.action(replaceAll(parsed.content));
        }
        this.cdr.markForCheck();
      },
      error: () =>
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el fichero' }),
    });
  }

  toggleFrontmatter(): void {
    this.showFrontmatter.update(v => !v);
    if (!this.showFrontmatter()) this.editingFrontmatter.set(false);
  }

  toggleFrontmatterEdit(): void {
    if (!this.editingFrontmatter()) {
      this.frontmatterRawYaml.set(stringifyYaml(this.frontmatter()));
      this.frontmatterYamlError.set(false);
    }
    this.editingFrontmatter.update(v => !v);
  }

  onFrontmatterYamlChange(value: string): void {
    this.frontmatterRawYaml.set(value);
    try {
      const parsed = (parseYaml(value) ?? {}) as Record<string, unknown>;
      if (typeof parsed === 'object' && !Array.isArray(parsed)) {
        this.frontmatter.set(parsed);
        this.frontmatterYamlError.set(false);
        this.isDirty.set(true);
        this.cdr.markForCheck();
      } else {
        this.frontmatterYamlError.set(true);
      }
    } catch {
      this.frontmatterYamlError.set(true);
    }
  }

  formatFmValue(value: unknown): string {
    if (Array.isArray(value)) return value.join(', ');
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return String(value ?? '');
  }

  toggleTreePanel(): void {
    this.treePanelCollapsed.update(v => !v);
  }

  openSearch(): void {
    this.searchQuery.set('');
    this.showSearch.set(true);
  }

  selectFromSearch(node: TreeNode): void {
    this.showSearch.set(false);
    if (this.isDirty()) {
      this.confirmationService.confirm({
        message: 'Hay cambios sin guardar. ¿Descartar y abrir el fichero seleccionado?',
        header: 'Cambios sin guardar',
        icon: 'pi pi-exclamation-triangle',
        accept: () => this.loadFile(node),
        reject: () => {},
      });
    } else {
      this.loadFile(node);
    }
  }

  onResizerMouseDown(event: MouseEvent): void {
    if (this.treePanelCollapsed()) return;
    this.isResizing = true;
    this.resizeStartX = event.clientX;
    this.resizeStartWidth = this.treePanelWidth();
    event.preventDefault();
  }

  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (!this.isResizing) return;
    const delta = event.clientX - this.resizeStartX;
    const newWidth = Math.min(600, Math.max(150, this.resizeStartWidth + delta));
    this.treePanelWidth.set(newWidth);
  }

  @HostListener('document:mouseup')
  onMouseUp(): void {
    this.isResizing = false;
  }

  @HostListener('document:keydown.control.s', ['$event'])
  onCtrlS(event: Event): void {
    event.preventDefault();
    if (this.isDirty()) this.save();
  }

  save(): void {
    const path = this.selectedPath();
    if (!path) return;
    const fm = this.frontmatter();
    const fullContent = Object.keys(fm).length > 0
      ? this.stringifyWithFrontmatter(this.currentMarkdown, fm)
      : this.currentMarkdown;
    this.fileService.saveContent(path, fullContent).subscribe({
      next: () => {
        this.isDirty.set(false);
        this.messageService.add({ severity: 'success', summary: 'Guardado', detail: 'Fichero guardado correctamente' });
        this.cdr.markForCheck();
      },
      error: () =>
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo guardar el fichero' }),
    });
  }

  goHome(): void {
    this.router.navigateByUrl('/');
  }

  logout(): void {
    this.auth.logout();
    this.router.navigateByUrl('/login');
  }
}
