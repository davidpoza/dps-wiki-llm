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
import { SlicePipe } from '@angular/common';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { Router } from '@angular/router';
import { Editor, defaultValueCtx, editorViewOptionsCtx, rootCtx } from '@milkdown/core';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { commonmark } from '@milkdown/preset-commonmark';
import { replaceAll } from '@milkdown/utils';
import { createWikilinkPlugin, WikilinkCoords } from './wikilink.plugin';
import { createMarkdownLinkPlugin } from './markdown-link.plugin';
import { createMarkdownImagePlugin } from './markdown-image.plugin';
import { createLivePreviewPlugin } from './live-preview.plugin';
import type { EditorView } from '@milkdown/prose/view';
import { TreeNode, ConfirmationService, MessageService, MenuItem } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ContextMenuModule } from 'primeng/contextmenu';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { ToastModule } from 'primeng/toast';
import { ToolbarModule } from 'primeng/toolbar';
import { TreeModule } from 'primeng/tree';
import { HttpStatusCode } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { TranslocoPipe, TranslocoService } from '@jsverse/transloco';
import { AuthService } from '../services/auth.service';
import { FileService } from '../services/file.service';

@Component({
  selector: 'app-explorer',
  standalone: true,
  imports: [TreeModule, ButtonModule, ContextMenuModule, ToastModule, ConfirmDialogModule, ToolbarModule, DialogModule, InputTextModule, SlicePipe, TranslocoPipe],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast />
    <p-confirmDialog />
    <p-contextMenu #cm [model]="contextMenuItems()" />

    <main class="explorer-shell">
      <header class="topbar">
        <div class="brand">
          <h1>{{ 'common.brand' | transloco }}</h1>
          <p>{{ 'explorer.subtitle' | transloco }}</p>
        </div>
        <div class="topbar-actions">
          <p-button severity="secondary" [label]="'common.home' | transloco" size="small" (onClick)="goHome()" />
          <p-button severity="secondary" [label]="'common.signOut' | transloco" size="small" (onClick)="logout()" />
        </div>
      </header>

      <div class="explorer-layout">
        <nav class="sidebar-toolbar">
          <p-button
            icon="pi pi-search"
            [text]="true"
            severity="secondary"
            size="small"
            [title]="'explorer.searchFile' | transloco"
            (onClick)="openSearch()"
          />
          <p-button
            [icon]="treePanelCollapsed() ? 'pi pi-chevron-right' : 'pi pi-chevron-left'"
            [text]="true"
            severity="secondary"
            size="small"
            [title]="treePanelCollapsed() ? ('explorer.expandPanel' | transloco) : ('explorer.collapsePanel' | transloco)"
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
            [contextMenu]="cm"
            (onNodeContextMenuSelect)="onNodeContextMenuSelect($event)"
            styleClass="w-full"
            [emptyMessage]="'explorer.noResults' | transloco"
          >
            <ng-template pTemplate="default" let-node>
              <span class="tree-label" [title]="node.label">{{ node.label }}</span>
            </ng-template>
          </p-tree>
          @if (treeNodes().length === 0) {
            <p class="empty-msg">{{ 'explorer.noDocuments' | transloco }}</p>
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
                [label]="'explorer.save' | transloco"
                size="small"
                [disabled]="!isDirty()"
                (onClick)="save()"
              />
            </div>
            @if (frontmatterEntries().length > 0) {
              <div class="frontmatter-panel">
                <div class="frontmatter-header">
                  <span class="frontmatter-title">{{ 'explorer.metadata' | transloco }}</span>
                  <div class="fm-actions">
                    <button class="fm-toggle" (click)="toggleFrontmatterEdit()" [class.active]="editingFrontmatter()">
                      {{ editingFrontmatter() ? ('explorer.editView' | transloco) : ('explorer.editEdit' | transloco) }}
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
                        <span class="fm-yaml-error">{{ 'explorer.yamlInvalid' | transloco }}</span>
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
            <div class="placeholder">{{ 'explorer.selectFile' | transloco }}</div>
          }
        </section>
      </div>
    </main>

    @if (wikilinkQuery() !== null && wikilinkCoords()) {
      <div
        class="wikilink-dropdown"
        [style.left.px]="wikilinkCoords()!.left"
        [style.top.px]="wikilinkCoords()!.bottom + 4"
      >
        @if (wikilinkSuggestions().length === 0) {
          <div class="wikilink-dropdown-empty">{{ 'explorer.noResults' | transloco }}</div>
        }
        @for (file of wikilinkSuggestions(); track file.data) {
          <div class="wikilink-dropdown-item" (mousedown)="$event.preventDefault()" (click)="insertWikilinkFromSuggestion(file)">
            <i class="pi pi-file"></i>
            <span>{{ (file.label ?? '') | slice:0:-3 }}</span>
          </div>
        }
      </div>
    }

    <p-dialog
      [header]="'explorer.searchFile' | transloco"
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
          [placeholder]="'explorer.searchPlaceholder' | transloco"
          class="w-full"
          [value]="searchQuery()"
          (input)="searchQuery.set($any($event.target).value)"
        />
      </div>
      <div class="search-results">
        @if (filteredFiles().length === 0) {
          <p class="search-empty">{{ 'explorer.noResults' | transloco }}</p>
        }
        @for (file of filteredFiles(); track file.data) {
          <div class="search-result" (click)="selectFromSearch(file)">
            <i class="pi pi-file"></i>
            <span [innerHTML]="file.label"></span>
          </div>
        }
      </div>
    </p-dialog>

    <p-dialog
      [header]="'explorer.dialogRenameHeader' | transloco"
      [(visible)]="showRenameDialog"
      [modal]="true"
      [draggable]="false"
      [style]="{ width: '400px' }"
    >
      <div class="search-box">
        <input
          pInputText
          type="text"
          [placeholder]="'explorer.renamePlaceholder' | transloco"
          class="w-full"
          [value]="renameValue()"
          (input)="renameValue.set($any($event.target).value)"
          (keydown.enter)="confirmRename()"
        />
      </div>
      <ng-template pTemplate="footer">
        <p-button [label]="'common.cancel' | transloco" severity="secondary" size="small" (onClick)="showRenameDialog.set(false)" />
        <p-button [label]="'explorer.rename' | transloco" size="small" [disabled]="!renameValue().trim()" (onClick)="confirmRename()" />
      </ng-template>
    </p-dialog>

    <p-dialog
      [header]="'explorer.dialogCreateFileHeader' | transloco"
      [(visible)]="showCreateDialog"
      [modal]="true"
      [draggable]="false"
      [style]="{ width: '400px' }"
    >
      <div class="search-box">
        <input
          pInputText
          type="text"
          [placeholder]="'explorer.searchPlaceholder' | transloco"
          class="w-full"
          [value]="createFileName()"
          (input)="createFileName.set($any($event.target).value)"
          (keydown.enter)="confirmCreate()"
        />
      </div>
      <ng-template pTemplate="footer">
        <p-button [label]="'common.cancel' | transloco" severity="secondary" size="small" (onClick)="showCreateDialog.set(false)" />
        <p-button [label]="'explorer.create' | transloco" size="small" [disabled]="!createFileName().trim()" (onClick)="confirmCreate()" />
      </ng-template>
    </p-dialog>

    <p-dialog
      [header]="'explorer.dialogCreateDirHeader' | transloco"
      [(visible)]="showCreateDirDialog"
      [modal]="true"
      [draggable]="false"
      [style]="{ width: '400px' }"
    >
      <div class="search-box">
        <input
          pInputText
          type="text"
          [placeholder]="'explorer.createDirPlaceholder' | transloco"
          class="w-full"
          [value]="createDirName()"
          (input)="createDirName.set($any($event.target).value)"
          (keydown.enter)="confirmCreateDir()"
        />
      </div>
      <ng-template pTemplate="footer">
        <p-button [label]="'common.cancel' | transloco" severity="secondary" size="small" (onClick)="showCreateDirDialog.set(false)" />
        <p-button [label]="'explorer.create' | transloco" size="small" [disabled]="!createDirName().trim()" (onClick)="confirmCreateDir()" />
      </ng-template>
    </p-dialog>

    <p-dialog
      [header]="'explorer.dialogMoveHeader' | transloco"
      [(visible)]="showMoveDialog"
      [modal]="true"
      [draggable]="false"
      [style]="{ width: '420px' }"
    >
      <p class="move-help">{{ 'explorer.moveHelp' | transloco }}</p>
      <div class="move-tree-wrap">
        <div
          class="move-root-item"
          [class.selected]="!moveTargetDir()"
          (click)="moveTargetDir.set(null); moveTargetDirNode = null"
        >
          <i class="pi pi-home"></i> {{ 'explorer.vaultRoot' | transloco }}
        </div>
        @if (dirTreeNodes().length > 0) {
          <p-tree
            [value]="dirTreeNodes()"
            selectionMode="single"
            [(selection)]="moveTargetDirNode"
            (onNodeSelect)="onMoveDirSelect($event)"
            styleClass="w-full"
          />
        }
      </div>
      <ng-template pTemplate="footer">
        <p-button [label]="'common.cancel' | transloco" severity="secondary" size="small" (onClick)="showMoveDialog.set(false)" />
        <p-button [label]="'explorer.moveHere' | transloco" size="small" (onClick)="confirmMove()" />
      </ng-template>
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
    .wikilink-dropdown {
      position: fixed;
      z-index: 9999;
      background: #fff;
      border: 1px solid #d1d9e0;
      border-radius: 6px;
      box-shadow: 0 4px 16px rgba(0,0,0,0.12);
      min-width: 240px;
      max-width: 380px;
      max-height: 280px;
      overflow-y: auto;
      padding: 4px 0;
    }
    .wikilink-dropdown-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 7px 14px;
      cursor: pointer;
      font-size: 0.875rem;
      color: #18212f;
      transition: background 0.1s;
    }
    .wikilink-dropdown-item:hover {
      background: #f0f4f8;
    }
    .wikilink-dropdown-item .pi {
      color: #5d6878;
      font-size: 0.8rem;
      flex-shrink: 0;
    }
    .wikilink-dropdown-empty {
      padding: 12px 14px;
      font-size: 0.875rem;
      color: #5d6878;
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
    :host ::ng-deep .milkdown a { cursor: pointer; color: #2563eb; text-decoration: underline; }
    :host ::ng-deep .milkdown a:hover { color: #1d4ed8; }
    :host ::ng-deep .wikilink-token {
      color: #6366f1;
      background: #eef2ff;
      border-radius: 3px;
      padding: 1px 2px;
      cursor: pointer;
      font-weight: 500;
    }
    :host ::ng-deep .wikilink-token:hover {
      background: #e0e7ff;
      text-decoration: underline;
    }
    :host ::ng-deep .milkdown h1 { font-size: 2em; font-weight: 700; margin: 0.5em 0 0.3em; line-height: 1.2; }
    :host ::ng-deep .milkdown h2 { font-size: 1.5em; font-weight: 700; margin: 0.6em 0 0.3em; line-height: 1.3; }
    :host ::ng-deep .milkdown h3 { font-size: 1.25em; font-weight: 600; margin: 0.7em 0 0.3em; line-height: 1.4; }
    :host ::ng-deep .milkdown h4 { font-size: 1.05em; font-weight: 600; margin: 0.8em 0 0.25em; }
    :host ::ng-deep .milkdown h5 { font-size: 0.9em; font-weight: 600; margin: 0.9em 0 0.25em; }
    :host ::ng-deep .milkdown h6 { font-size: 0.85em; font-weight: 600; margin: 0.9em 0 0.25em; color: #5d6878; }
    :host ::ng-deep .milkdown blockquote {
      border-left: 4px solid #6366f1;
      margin: 0.75em 0;
      padding: 0.4em 1em;
      background: #f8f8ff;
      color: #374151;
      border-radius: 0 4px 4px 0;
    }
    :host ::ng-deep .milkdown ul { list-style: disc; padding-left: 1.75em; margin: 0.5em 0; }
    :host ::ng-deep .milkdown ol { list-style: decimal; padding-left: 1.75em; margin: 0.5em 0; }
    :host ::ng-deep .milkdown li { margin: 0.2em 0; }
    :host ::ng-deep .milkdown pre {
      background: #f3f4f6;
      border-radius: 6px;
      padding: 0.9em 1em;
      overflow-x: auto;
      margin: 0.75em 0;
    }
    :host ::ng-deep .milkdown pre code {
      font-family: 'Fira Code', 'Cascadia Code', monospace;
      font-size: 0.85em;
      background: none;
      padding: 0;
      border-radius: 0;
    }
    :host ::ng-deep .milkdown code {
      font-family: 'Fira Code', 'Cascadia Code', monospace;
      font-size: 0.85em;
      background: #f3f4f6;
      padding: 0.15em 0.35em;
      border-radius: 3px;
    }
    :host ::ng-deep .milkdown hr {
      border: none;
      border-top: 2px solid #e2e5ea;
      margin: 1.5em 0;
    }
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
    .move-help { margin: 0 0 8px; font-size: 0.85rem; color: #5d6878; }
    .move-tree-wrap { border: 1px solid #d1d9e0; border-radius: 6px; max-height: 300px; overflow-y: auto; padding: 4px 0; }
    .move-root-item {
      display: flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      cursor: pointer;
      font-size: 0.875rem;
      border-bottom: 1px solid #e2e5ea;
    }
    .move-root-item:hover { background: #f0f4f8; }
    .move-root-item.selected { background: #eef2ff; font-weight: 600; color: #4f46e5; }
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
  private readonly t = inject(TranslocoService);

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
  readonly contextMenuItems = signal<MenuItem[]>([]);
  readonly contextMenuNode = signal<TreeNode | null>(null);
  readonly showRenameDialog = signal(false);
  readonly renameValue = signal('');
  readonly showCreateDialog = signal(false);
  readonly createFileName = signal('');
  readonly showCreateDirDialog = signal(false);
  readonly createDirName = signal('');
  readonly showMoveDialog = signal(false);
  readonly moveTargetDir = signal<TreeNode | null>(null);
  readonly dirTreeNodes = computed(() => {
    const filterDirs = (nodes: TreeNode[]): TreeNode[] =>
      nodes.filter(n => !n.leaf).map(n => ({ ...n, children: filterDirs(n.children ?? []) }));
    return filterDirs(this.treeNodes());
  });

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
  moveTargetDirNode: TreeNode | null = null;

  readonly wikilinkQuery = signal<string | null>(null);
  readonly wikilinkCoords = signal<WikilinkCoords | null>(null);
  readonly wikilinkSuggestions = computed(() => {
    const q = this.wikilinkQuery();
    if (q === null) return [];
    const lower = q.toLowerCase();
    return this.allFiles()
      .filter(n => !lower || (n.label ?? '').toLowerCase().includes(lower))
      .slice(0, 12);
  });

  private editor: Editor | null = null;
  private editorView: EditorView | null = null;
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
        this.messageService.add({ severity: 'error', summary: this.t.translate('common.error'), detail: this.t.translate('explorer.toastErrorLoadTree') }),
    });
  }

  private getExpandedPaths(nodes: TreeNode[]): Set<string> {
    const paths = new Set<string>();
    const collect = (ns: TreeNode[]) => {
      for (const n of ns) {
        if (n.expanded) paths.add(n.data as string);
        if (n.children?.length) collect(n.children);
      }
    };
    collect(nodes);
    return paths;
  }

  private restoreExpanded(nodes: TreeNode[], expanded: Set<string>): TreeNode[] {
    return nodes.map(n => ({
      ...n,
      expanded: expanded.has(n.data as string),
      children: n.children ? this.restoreExpanded(n.children, expanded) : [],
    }));
  }

  private reloadTree(): void {
    const expanded = this.getExpandedPaths(this.treeNodes());
    this.fileService.getTree().subscribe({
      next: nodes => {
        this.treeNodes.set(this.restoreExpanded(nodes, expanded));
        this.cdr.markForCheck();
      },
      error: () =>
        this.messageService.add({ severity: 'error', summary: this.t.translate('common.error'), detail: this.t.translate('explorer.toastErrorUpdateTree') }),
    });
  }

  openRenameDialog(): void {
    const node = this.contextMenuNode();
    if (!node) return;
    this.renameValue.set(node.label ?? '');
    this.showRenameDialog.set(true);
  }

  confirmRename(): void {
    const node = this.contextMenuNode();
    const newName = this.renameValue().trim();
    if (!node || !newName) return;
    this.showRenameDialog.set(false);
    this.fileService.renameFile(node.data as string, newName).subscribe({
      next: () => {
        if (this.selectedPath() === (node.data as string)) {
          const dir = (node.data as string).includes('/')
            ? (node.data as string).substring(0, (node.data as string).lastIndexOf('/') + 1)
            : '';
          const newPath = dir + newName;
          this.selectedPath.set(newPath);
          this.selectedLabel.set(newName);
        }
        this.reloadTree();
        this.messageService.add({ severity: 'success', summary: this.t.translate('explorer.toastSummaryRenamed'), detail: this.t.translate('explorer.toastSuccessRenamed', { name: newName }) });
      },
      error: err => {
        const msg = err.status === HttpStatusCode.Conflict
          ? this.t.translate('explorer.toastErrorRenameConflict', { name: newName })
          : this.t.translate('explorer.toastErrorRename');
        this.messageService.add({ severity: 'error', summary: this.t.translate('common.error'), detail: msg });
      },
    });
  }

  openCreateDialog(): void {
    this.createFileName.set('');
    this.showCreateDialog.set(true);
  }

  confirmCreate(): void {
    const dirNode = this.contextMenuNode();
    let name = this.createFileName().trim();
    if (!dirNode || !name) return;
    if (!name.endsWith('.md')) name = name + '.md';
    const dirPath = dirNode.data as string;
    const newPath = dirPath ? dirPath + '/' + name : name;
    this.showCreateDialog.set(false);
    this.fileService.createFile(newPath).subscribe({
      next: () => {
        this.reloadTree();
        const newNode: TreeNode = { label: name, data: newPath, leaf: true };
        this.loadFile(newNode);
        this.messageService.add({ severity: 'success', summary: this.t.translate('explorer.toastSummaryCreated'), detail: this.t.translate('explorer.toastSuccessFileCreated', { name }) });
      },
      error: err => {
        const msg = err.status === HttpStatusCode.Conflict
          ? this.t.translate('explorer.toastErrorFileConflict', { name })
          : this.t.translate('explorer.toastErrorFileCreate');
        this.messageService.add({ severity: 'error', summary: this.t.translate('common.error'), detail: msg });
      },
    });
  }

  openCreateDirDialog(): void {
    this.createDirName.set('');
    this.showCreateDirDialog.set(true);
  }

  confirmCreateDir(): void {
    const dirNode = this.contextMenuNode();
    const name = this.createDirName().trim();
    if (!dirNode || !name) return;
    const parentPath = dirNode.data as string;
    const newPath = parentPath ? parentPath + '/' + name : name;
    this.showCreateDirDialog.set(false);
    this.fileService.createDirectory(newPath).subscribe({
      next: () => {
        this.reloadTree();
        this.messageService.add({ severity: 'success', summary: this.t.translate('explorer.toastSummaryCreated'), detail: this.t.translate('explorer.toastSuccessDirCreated', { name }) });
      },
      error: err => {
        const msg = err.status === HttpStatusCode.Conflict
          ? this.t.translate('explorer.toastErrorDirConflict', { name })
          : this.t.translate('explorer.toastErrorDirCreate');
        this.messageService.add({ severity: 'error', summary: this.t.translate('common.error'), detail: msg });
      },
    });
  }

  openMoveDialog(): void {
    this.moveTargetDir.set(null);
    this.moveTargetDirNode = null;
    this.showMoveDialog.set(true);
  }

  onMoveDirSelect(event: { node: TreeNode }): void {
    this.moveTargetDir.set(event.node);
  }

  confirmMove(): void {
    const node = this.contextMenuNode();
    if (!node) return;
    const targetNode = this.moveTargetDir();
    const targetDir = targetNode ? (targetNode.data as string) : '';
    this.showMoveDialog.set(false);
    this.fileService.moveFile(node.data as string, targetDir).subscribe({
      next: () => {
        const filename = node.label ?? '';
        const newPath = targetDir ? targetDir + '/' + filename : filename;
        if (this.selectedPath() === (node.data as string)) {
          this.selectedPath.set(newPath);
        }
        this.reloadTree();
        const dest = targetDir || '/';
        this.messageService.add({ severity: 'success', summary: this.t.translate('explorer.toastSummaryMoved'), detail: this.t.translate('explorer.toastSuccessMoved', { name: filename, dest }) });
      },
      error: err => {
        const msg = err.status === HttpStatusCode.Conflict
          ? this.t.translate('explorer.toastErrorMoveConflict')
          : this.t.translate('explorer.toastErrorMove');
        this.messageService.add({ severity: 'error', summary: this.t.translate('common.error'), detail: msg });
      },
    });
  }

  deleteNode(): void {
    const node = this.contextMenuNode();
    if (!node) return;
    this.confirmationService.confirm({
      message: this.t.translate('explorer.confirmDeleteMessage', { name: node.label }),
      header: this.t.translate('explorer.confirmDeleteHeader'),
      icon: 'pi pi-trash',
      accept: () => {
        this.fileService.deleteFile(node.data as string).subscribe({
          next: () => {
            if (this.selectedPath() === (node.data as string)) {
              this.selectedPath.set(null);
              this.selectedLabel.set('');
              this.isDirty.set(false);
              if (this.editor) this.editor.action(replaceAll(''));
            }
            this.reloadTree();
            this.messageService.add({ severity: 'success', summary: this.t.translate('explorer.toastSummaryDeleted'), detail: this.t.translate('explorer.toastSuccessDeleted', { name: node.label }) });
          },
          error: () =>
            this.messageService.add({ severity: 'error', summary: this.t.translate('common.error'), detail: this.t.translate('explorer.toastErrorDelete') }),
        });
      },
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
      .use(createMarkdownImagePlugin())
      .use(createMarkdownLinkPlugin())
      .use(createLivePreviewPlugin())
      .use(createWikilinkPlugin({
        onNavigate: target => this.navigateToWikilink(target),
        onAutocomplete: (query, coords, view) => {
          this.editorView = view;
          this.wikilinkQuery.set(query);
          this.wikilinkCoords.set(coords);
          this.cdr.markForCheck();
        },
      }))
      .create()
      .then(editor => {
        this.editor = editor;
      });
  }

  onNodeContextMenuSelect(event: { node: TreeNode }): void {
    const node = event.node;
    this.contextMenuNode.set(node);
    if (node.leaf) {
      this.contextMenuItems.set([
        { label: this.t.translate('explorer.contextMenuRename'), icon: 'pi pi-pencil', command: () => this.openRenameDialog() },
        { label: this.t.translate('explorer.contextMenuMove'), icon: 'pi pi-folder-open', command: () => this.openMoveDialog() },
        { label: this.t.translate('explorer.contextMenuDelete'), icon: 'pi pi-trash', command: () => this.deleteNode() },
      ]);
    } else {
      this.contextMenuItems.set([
        { label: this.t.translate('explorer.contextMenuCreateFile'), icon: 'pi pi-file-plus', command: () => this.openCreateDialog() },
        { label: this.t.translate('explorer.contextMenuCreateDir'), icon: 'pi pi-folder-plus', command: () => this.openCreateDirDialog() },
      ]);
    }
  }

  onNodeSelect(event: { node: TreeNode }): void {
    const node = event.node;
    if (!node.leaf) return;

    if (this.isDirty()) {
      this.confirmationService.confirm({
        message: this.t.translate('explorer.confirmUnsavedMessage'),
        header: this.t.translate('explorer.confirmUnsavedHeader'),
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
        this.messageService.add({ severity: 'error', summary: this.t.translate('common.error'), detail: this.t.translate('explorer.toastErrorLoadTree') }),
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

  navigateToWikilink(target: string): void {
    const label = target.toLowerCase();
    const file = this.allFiles().find(n =>
      (n.label ?? '').toLowerCase().replace(/\.md$/i, '') === label ||
      (n.label ?? '').toLowerCase() === label
    );
    if (!file) {
      this.messageService.add({ severity: 'warn', summary: this.t.translate('explorer.toastSummaryBrokenLink'), detail: this.t.translate('explorer.toastBrokenLink', { target }) });
      return;
    }
    if (this.isDirty()) {
      this.confirmationService.confirm({
        message: this.t.translate('explorer.confirmUnsavedNavigate'),
        header: this.t.translate('explorer.confirmUnsavedHeader'),
        icon: 'pi pi-exclamation-triangle',
        accept: () => this.loadFile(file),
        reject: () => {},
      });
    } else {
      this.loadFile(file);
    }
  }

  insertWikilinkFromSuggestion(node: TreeNode): void {
    const view = this.editorView;
    if (!view) return;

    const { $head } = view.state.selection;
    const textBefore = $head.parent.textContent.slice(0, $head.parentOffset);
    const match = textBefore.match(/\[\[([^\]|]*)$/);
    if (!match) return;

    const target = (node.label ?? '').replace(/\.md$/i, '');
    const insertion = `[[${target}]]`;
    const from = $head.pos - match[0].length;
    const to = $head.pos;

    view.dispatch(view.state.tr.insertText(insertion, from, to));
    view.focus();
    this.wikilinkQuery.set(null);
    this.wikilinkCoords.set(null);
  }

  closeWikilinkDropdown(): void {
    this.wikilinkQuery.set(null);
    this.wikilinkCoords.set(null);
  }

  openSearch(): void {
    this.searchQuery.set('');
    this.showSearch.set(true);
  }

  selectFromSearch(node: TreeNode): void {
    this.showSearch.set(false);
    if (this.isDirty()) {
      this.confirmationService.confirm({
        message: this.t.translate('explorer.confirmUnsavedMessage'),
        header: this.t.translate('explorer.confirmUnsavedHeader'),
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

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.wikilinkQuery() !== null) this.closeWikilinkDropdown();
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
        this.messageService.add({ severity: 'success', summary: this.t.translate('explorer.toastSummaryGuardado'), detail: this.t.translate('explorer.toastSuccessSaved') });
        this.cdr.markForCheck();
      },
      error: () =>
        this.messageService.add({ severity: 'error', summary: this.t.translate('common.error'), detail: this.t.translate('explorer.toastErrorSave') }),
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
