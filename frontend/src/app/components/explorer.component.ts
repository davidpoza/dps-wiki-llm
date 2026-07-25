import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  DestroyRef,
  effect,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NgClass, SlicePipe } from '@angular/common';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { ActivatedRoute, Router } from '@angular/router';
import { skip } from 'rxjs/operators';
import { Editor, defaultValueCtx, editorViewCtx, editorViewOptionsCtx, rootCtx } from '@milkdown/core';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { history } from '@milkdown/plugin-history';
import { commonmark } from '@milkdown/preset-commonmark';
import { gfm } from '@milkdown/preset-gfm';
import { replaceAll } from '@milkdown/utils';
import { createWikilinkPlugin, WikilinkCoords } from './wikilink.plugin';
import { createMarkdownLinkPlugin } from './markdown-link.plugin';
import { createMarkdownImagePlugin } from './markdown-image.plugin';
import { createLivePreviewPlugin, insertTableAtCursor } from './live-preview.plugin';
import { createObsidianImagePreviewPlugin, OBSIDIAN_IMAGE_PREVIEW_REFRESH } from './obsidian-image-preview.plugin';
import { createClipboardImagePlugin } from './clipboard-image.plugin';
import { createImageResourceViewPlugin } from './image-resource-view.plugin';
import type { EditorView } from '@milkdown/prose/view';
import { TreeNode, ConfirmationService, MessageService, MenuItem } from 'primeng/api';
import { Tree } from 'primeng/tree';
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
import { ApiService, DiscoveredLink, EmbeddingStatus } from '../services/api.service';
import { AuthService } from '../services/auth.service';
import { FileService } from '../services/file.service';
import { GlobalSearchService } from '../services/global-search.service';
import { NavComponent } from './nav.component';
import { UnsavedChangesAware } from '../unsaved-changes.guard';
import { FileVersion } from '../types';
import { ProgressBarModule } from 'primeng/progressbar';
import { Checkbox } from 'primeng/checkbox';
import { FormsModule } from '@angular/forms';
import { GraphViewComponent } from './graph-view.component';
import { GraphSettingsComponent, GraphSettings, DEFAULT_GRAPH_SETTINGS } from './graph-settings.component';
import { LinkExplainModalComponent } from './link-explain-modal.component';

@Component({
  selector: 'app-explorer',
  standalone: true,
  imports: [
    TreeModule,
    ButtonModule,
    ContextMenuModule,
    ToastModule,
    ConfirmDialogModule,
    ToolbarModule,
    DialogModule,
    InputTextModule,
    SlicePipe,
    NgClass,
    TranslocoPipe,
    ProgressBarModule,
    NavComponent,
    Checkbox,
    FormsModule,
    GraphViewComponent,
    GraphSettingsComponent,
    LinkExplainModalComponent,
  ],
  providers: [MessageService, ConfirmationService],
  template: `
    <p-toast />
    <p-confirmDialog />
    <p-contextMenu #cm [model]="contextMenuItems()" />

    <main class="explorer-shell">
      <app-nav />

      <div class="explorer-layout">
        <nav class="sidebar-toolbar">
          <p-button
            icon="pi pi-search"
            [text]="true"
            severity="secondary"
            size="small"
            [title]="'explorer.searchFile' | transloco"
            (onClick)="globalSearchService.open()"
          />
          <p-button
            icon="pi pi-folder"
            [text]="true"
            severity="secondary"
            size="small"
            title="Árbol de ficheros"
            [class.sidebar-btn-active]="sidebarPanel() === 'files'"
            (onClick)="toggleSidebarPanel('files')"
          />
          <p-button
            icon="pi pi-list"
            [text]="true"
            severity="secondary"
            size="small"
            title="Tabla de contenido"
            [class.sidebar-btn-active]="sidebarPanel() === 'toc'"
            (onClick)="toggleSidebarPanel('toc')"
          />
          <p-button
            icon="pi pi-share-alt"
            [text]="true"
            severity="secondary"
            size="small"
            [title]="'explorer.graphView' | transloco"
            [class.sidebar-btn-active]="sidebarPanel() === 'graph'"
            (onClick)="toggleSidebarPanel('graph')"
          />
        </nav>

        <aside
          class="file-tree-panel"
          [class.collapsed]="treePanelCollapsed()"
          [style.width.px]="treePanelCollapsed() ? 0 : treePanelWidth()"
        >
          @if (sidebarPanel() === 'files') {
            <p-tree
              #fileTree
              [value]="treeNodes()"
              selectionMode="single"
              [(selection)]="selectedNode"
              (onNodeSelect)="onNodeSelect($event)"
              [contextMenu]="cm"
              (onNodeContextMenuSelect)="onNodeContextMenuSelect($event)"
              styleClass="w-full"
              [emptyMessage]="'explorer.noResults' | transloco"
              [virtualScroll]="true"
              [virtualScrollItemSize]="32"
              scrollHeight="flex"
            >
              <ng-template pTemplate="default" let-node>
                <span class="tree-label" [title]="node.label">{{ node.label }}</span>
              </ng-template>
            </p-tree>
            @if (treeNodes().length === 0) {
              <p class="empty-msg">{{ 'explorer.noDocuments' | transloco }}</p>
            }
          } @else if (sidebarPanel() === 'toc') {
            <div class="toc-panel">
              @if (!selectedPath()) {
                <p class="toc-empty">Abre un fichero para ver su índice</p>
              } @else if (tocTreeNodes().length === 0) {
                <p class="toc-empty">Sin encabezados</p>
              } @else {
                <p-tree
                  [value]="tocTreeNodes()"
                  selectionMode="single"
                  styleClass="toc-tree w-full"
                  scrollHeight="flex"
                  (onNodeSelect)="onTocNodeSelect($event)"
                >
                  <ng-template pTemplate="default" let-node>
                    <span class="toc-node-label" [title]="node.label">{{ node.label }}</span>
                  </ng-template>
                </p-tree>
              }
            </div>
          } @else if (sidebarPanel() === 'graph') {
            <app-graph-settings [settings]="graphSettings()" (settingsChange)="onGraphSettingsChange($event)" />
          }
        </aside>

        <div class="resizer" [class.active]="isResizing" (mousedown)="onResizerMouseDown($event)"></div>

        <section class="editor-panel">
          @if (sidebarPanel() === 'graph') {
            <app-graph-view [settings]="graphSettings()" [activePath]="selectedPath()" />
          }
          <div class="editor-content-wrap" [hidden]="sidebarPanel() === 'graph'">
            @if (selectedPath()) {
              <div class="editor-header">
                <div class="editor-title" [title]="selectedPath()">
                  @if (embeddingStatus(); as es) {
                    <span
                      class="embedding-status-icon"
                      [class.embedding-status-icon--has]="es.hasEmbedding"
                      [title]="
                        es.hasEmbedding && es.lastUpdated
                          ? 'Embedding: ' + formatDate(es.lastUpdated)
                          : 'Sin embedding calculado'
                      "
                    >
                      <i [class]="es.hasEmbedding ? 'pi pi-circle-fill' : 'pi pi-circle'"></i>
                    </span>
                  }
                  @if (selectedPathParts(); as parts) {
                    <span class="file-path">
                      @if (parts.dir) {
                        <span class="file-path-dir">{{ parts.dir }}</span>
                      }
                      <span class="file-title">{{ parts.name }}</span>
                    </span>
                  }
                  @if (isDirty()) {
                    <span class="dirty-dot" title="Unsaved changes">●</span>
                  }
                  <p-button
                    icon="pi pi-pencil"
                    size="small"
                    severity="secondary"
                    [text]="true"
                    (onClick)="openRenameDialogFromHeader()"
                    title="Rename file"
                  />
                </div>
                <div class="editor-actions">
                  <div class="toolbar-group">
                    <p-button
                      icon="pi pi-table"
                      size="small"
                      severity="secondary"
                      [text]="true"
                      (onClick)="insertTable()"
                      title="Insertar tabla"
                      [disabled]="editorMode() === 'raw'"
                    />
                    <p-button
                      icon="pi pi-cloud-download"
                      size="small"
                      severity="secondary"
                      [text]="true"
                      [loading]="syncing()"
                      (onClick)="sync()"
                      [title]="'sync.button' | transloco"
                    />
                    <p-button
                      icon="pi pi-code"
                      size="small"
                      severity="secondary"
                      [text]="true"
                      title="Modo raw"
                      [class.sidebar-btn-active]="editorMode() === 'raw'"
                      [disabled]="!selectedPath()"
                      (onClick)="toggleEditorMode()"
                    />
                  </div>
                  <div class="actions-divider"></div>
                  <div class="doc-actions">
                    <p-button
                      icon="pi pi-save"
                      size="small"
                      [disabled]="!isDirty()"
                      (onClick)="save()"
                      [title]="'explorer.save' | transloco"
                    />
                    <p-button
                      icon="pi pi-sparkles"
                      size="small"
                      severity="secondary"
                      [disabled]="editorMode() === 'raw'"
                      (onClick)="enrich()"
                      [title]="'explorer.enrichButton' | transloco"
                    />
                    <p-button
                      icon="pi pi-sitemap"
                      size="small"
                      severity="secondary"
                      (onClick)="openLinkDiscovery()"
                      [title]="'explorer.discoverLinks' | transloco"
                    />
                    <p-button
                      icon="pi pi-history"
                      size="small"
                      severity="secondary"
                      (onClick)="openVersions()"
                      [title]="'versions.button' | transloco"
                    />
                    <p-button
                      icon="pi pi-file-pdf"
                      size="small"
                      severity="secondary"
                      (onClick)="generatePdf()"
                      [title]="'explorer.generatePdf' | transloco"
                    />
                    @if (isKeywordEligible()) {
                      <p-button
                        icon="pi pi-tag"
                        size="small"
                        severity="secondary"
                        [loading]="regeneratingKeywords()"
                        [disabled]="regeneratingKeywords()"
                        (onClick)="regenerateKeywords()"
                        title="Regenerar keywords"
                      />
                    }
                    <p-button
                      icon="pi pi-trash"
                      size="small"
                      severity="danger"
                      (onClick)="deleteCurrentFile()"
                      [title]="'explorer.contextMenuDelete' | transloco"
                    />
                  </div>
                </div>
              </div>
              @if (frontmatterEntries().length > 0) {
                <div class="frontmatter-panel">
                  <div class="frontmatter-header">
                    <span class="frontmatter-title">{{ 'explorer.metadata' | transloco }}</span>
                    <div class="fm-actions">
                      <button class="fm-toggle" (click)="toggleFrontmatterEdit()" [class.active]="editingFrontmatter()">
                        {{
                          editingFrontmatter() ? ('explorer.editView' | transloco) : ('explorer.editEdit' | transloco)
                        }}
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
            <div
              #editorContainer
              class="milkdown-container"
              [class.hidden]="!selectedPath() || editorMode() === 'raw'"
            ></div>
            @if (selectedPath() && editorMode() === 'raw') {
              <textarea
                class="raw-textarea"
                [value]="rawModeText()"
                (input)="rawModeText.set($any($event.target).value); isDirty.set(true)"
                spellcheck="false"
                autocomplete="off"
              ></textarea>
            }
            @if (!selectedPath()) {
              <div class="placeholder">{{ 'explorer.selectFile' | transloco }}</div>
            }
          </div>
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
          <div
            class="wikilink-dropdown-item"
            (mousedown)="$event.preventDefault()"
            (click)="insertWikilinkFromSuggestion(file)"
          >
            <i class="pi pi-file"></i>
            <span>{{ file.label ?? '' | slice: 0 : -3 }}</span>
          </div>
        }
      </div>
    }

    @if (wikilinkContextMenuVisible()) {
      <div
        class="wikilink-context-menu"
        [style.left.px]="wikilinkContextMenuX()"
        [style.top.px]="wikilinkContextMenuY()"
      >
        <div class="wikilink-context-menu-item" (click)="openLinkExplainModal()">
          <i class="pi pi-info-circle"></i>
          <span>Explicar enlace</span>
        </div>
      </div>
    }

    <app-link-explain-modal
      [(visible)]="linkExplainModalVisible"
      [sourcePath]="selectedPath()"
      [targetPath]="linkExplainTarget()"
    />

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
        <p-button
          [label]="'common.cancel' | transloco"
          severity="secondary"
          size="small"
          (onClick)="showRenameDialog.set(false)"
        />
        <p-button
          [label]="'explorer.rename' | transloco"
          size="small"
          [disabled]="!renameValue().trim()"
          (onClick)="confirmRename()"
        />
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
        <p-button
          [label]="'common.cancel' | transloco"
          severity="secondary"
          size="small"
          (onClick)="showCreateDialog.set(false)"
        />
        <p-button
          [label]="'explorer.create' | transloco"
          size="small"
          [disabled]="!createFileName().trim()"
          (onClick)="confirmCreate()"
        />
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
        <p-button
          [label]="'common.cancel' | transloco"
          severity="secondary"
          size="small"
          (onClick)="showCreateDirDialog.set(false)"
        />
        <p-button
          [label]="'explorer.create' | transloco"
          size="small"
          [disabled]="!createDirName().trim()"
          (onClick)="confirmCreateDir()"
        />
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
        <p-button
          [label]="'common.cancel' | transloco"
          severity="secondary"
          size="small"
          (onClick)="showMoveDialog.set(false)"
        />
        <p-button [label]="'explorer.moveHere' | transloco" size="small" (onClick)="confirmMove()" />
      </ng-template>
    </p-dialog>

    <p-dialog
      [header]="'explorer.linkDiscoveryHeader' | transloco"
      [(visible)]="showLinkDiscovery"
      [modal]="true"
      [draggable]="false"
      [style]="{ width: '600px', maxWidth: '95vw' }"
      (onHide)="onLinkDiscoveryHide()"
    >
      <div class="link-discovery-body">
        @if (linkDiscoveryRunning()) {
          <div class="ld-progress-area">
            <div class="ld-step-label">{{ linkDiscoveryStepLabel() }}</div>
            <p-progressBar [value]="linkDiscoveryPercent()" [showValue]="false" styleClass="ld-bar" />
          </div>
        } @else if (linkDiscoveryError()) {
          <div class="ld-error">
            <i class="pi pi-exclamation-triangle"></i>
            <span>{{ linkDiscoveryError() }}</span>
          </div>
        } @else if (linkDiscoveryNoKeywords()) {
          <div class="ld-warn">
            <i class="pi pi-info-circle"></i>
            <span>{{ 'explorer.linkDiscoveryNoKeywords' | transloco }}</span>
          </div>
        } @else {
          @if (linkDiscoveryResults().length === 0) {
            <p class="ld-empty">{{ 'explorer.linkDiscoveryNoResults' | transloco }}</p>
          } @else {
            <div class="ld-selection-row">
              <span class="ld-selection-count">{{ linkDiscoverySelected().size }} seleccionado(s)</span>
              <p-button
                [label]="linkDiscoveryAllSelected() ? 'Desmarcar todos' : 'Marcar todos'"
                severity="secondary"
                size="small"
                (onClick)="toggleAllLinkDiscovery()"
              />
            </div>
            <div class="ld-results">
              @for (link of linkDiscoveryResults(); track link.path) {
                <div class="ld-result-item">
                  <p-checkbox
                    [ngModel]="isLinkDiscoverySelected(link.path)"
                    [binary]="true"
                    (onChange)="toggleLinkDiscovery(link.path)"
                  />
                  <div class="ld-result-info">
                    <span class="ld-result-title">{{ link.title || link.path }}</span>
                    <span class="ld-result-path">{{ link.path }}</span>
                  </div>
                  <div class="ld-result-score">
                    <span class="ld-score-label">{{ 'explorer.linkDiscoveryScore' | transloco }}</span>
                    <span class="ld-score-value">{{ (link.score * 100).toFixed(0) }}%</span>
                  </div>
                </div>
              }
            </div>
          }
        }
      </div>
      <ng-template pTemplate="footer">
        <p-button
          [label]="'explorer.linkDiscoveryClose' | transloco"
          severity="secondary"
          size="small"
          (onClick)="showLinkDiscovery.set(false)"
        />
        <p-button
          label="Añadir a Related"
          severity="primary"
          size="small"
          [disabled]="linkDiscoverySelected().size === 0"
          (onClick)="addSelectedLinksToRelated()"
        />
      </ng-template>
    </p-dialog>

    <p-dialog
      [header]="'versions.header' | transloco"
      [(visible)]="showVersions"
      [modal]="true"
      [draggable]="false"
      [style]="{ width: '860px' }"
    >
      <div class="versions-layout">
        <div class="versions-list">
          @if (versions().length === 0) {
            <p class="hint">{{ 'versions.empty' | transloco }}</p>
          }
          @for (v of versions(); track v.versionId) {
            <div class="version-item" [class.active]="previewVersionId() === v.versionId" (click)="selectVersion(v)">
              <span class="v-date">{{ formatDate(v.createdAt) }}</span>
              <span class="v-source" [ngClass]="sourceClass(v.source)">{{ sourceLabel(v.source) }}</span>
            </div>
          }
        </div>
        <div class="versions-preview">
          @if (previewVersionId()) {
            <pre class="version-diff">@for (line of previewDiffLines(); track $index) {
<span [ngClass]="diffLineClass(line)">{{ line }}</span>
}</pre>
          } @else {
            <p class="hint">{{ 'versions.selectHint' | transloco }}</p>
          }
        </div>
      </div>
      <ng-template pTemplate="footer">
        <p-button
          [label]="'common.cancel' | transloco"
          severity="secondary"
          size="small"
          (onClick)="showVersions.set(false)"
        />
        <p-button
          [label]="'versions.restore' | transloco"
          size="small"
          [disabled]="!previewVersionId()"
          (onClick)="restoreVersion()"
        />
      </ng-template>
    </p-dialog>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100vh;
        height: 100dvh;
        overflow: hidden;
      }
      .explorer-shell {
        height: 100vh;
        height: 100dvh;
        overflow: hidden;
        background: var(--app-bg);
        color: var(--app-text);
        display: flex;
        flex-direction: column;
      }
      .explorer-layout {
        display: flex;
        flex: 1;
        min-height: 0;
        overflow: hidden;
      }
      .file-tree-panel {
        flex-shrink: 0;
        border-right: none;
        background: var(--app-surface);
        overflow: hidden;
        padding: 0;
        transition: width 0.2s ease;
        display: flex;
        flex-direction: column;
      }
      :host ::ng-deep .file-tree-panel .p-tree {
        padding: 0;
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
        border-right: 1px solid var(--app-border);
        background: var(--app-surface-muted);
      }
      :host ::ng-deep .sidebar-btn-active .p-button {
        color: var(--app-primary) !important;
        background: var(--app-primary-soft) !important;
        border-radius: 6px;
      }
      .resizer {
        flex-shrink: 0;
        width: 5px;
        background: var(--app-border);
        cursor: col-resize;
        transition: background 0.15s;
      }
      .resizer:hover,
      .resizer.active {
        background: var(--app-text-subtle);
      }
      @media (max-width: 767px) {
        .resizer {
          display: none;
        }
      }
      .wikilink-dropdown {
        position: fixed;
        z-index: 9999;
        background: var(--app-surface);
        border: 1px solid var(--app-border-strong);
        border-radius: 6px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
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
        color: var(--app-text);
        transition: background 0.1s;
      }
      .wikilink-dropdown-item:hover {
        background: var(--app-surface-subtle);
      }
      .wikilink-dropdown-item .pi {
        color: var(--app-text-muted);
        font-size: 0.8rem;
        flex-shrink: 0;
      }
      .wikilink-dropdown-empty {
        padding: 12px 14px;
        font-size: 0.875rem;
        color: var(--app-text-muted);
      }
      .wikilink-context-menu {
        position: fixed;
        z-index: 9999;
        background: var(--app-surface);
        border: 1px solid var(--app-border-strong);
        border-radius: 6px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
        min-width: 180px;
        padding: 4px 0;
      }
      .wikilink-context-menu-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px;
        cursor: pointer;
        font-size: 0.875rem;
        color: var(--app-text);
        transition: background 0.1s;
      }
      .wikilink-context-menu-item:hover {
        background: var(--app-surface-subtle);
      }
      .wikilink-context-menu-item .pi {
        color: var(--app-text-muted);
        font-size: 0.85rem;
        flex-shrink: 0;
      }
      .search-box {
        margin-bottom: 12px;
      }
      .search-box input {
        width: 100%;
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
      .empty-msg {
        color: var(--app-text-muted);
        font-size: 0.85rem;
        padding: 8px;
      }
      .toc-panel {
        display: flex;
        flex-direction: column;
        overflow: hidden;
        height: 100%;
      }
      .toc-empty {
        color: var(--app-text-muted);
        font-size: 0.82rem;
        padding: 8px;
      }
      :host ::ng-deep .toc-tree .p-tree-node-content {
        padding: 2px 4px;
      }
      :host ::ng-deep .toc-tree .p-tree-node-label {
        font-size: 0.82rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .toc-node-label {
        font-size: 0.82rem;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 180px;
        display: inline-block;
      }
      .editor-panel {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .editor-content-wrap {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-height: 0;
        overflow: hidden;
      }
      .editor-header {
        display: flex;
        flex-direction: column;
        padding: 6px 12px;
        border-bottom: 1px solid var(--app-border);
        background: var(--app-surface);
        gap: 2px;
      }
      .editor-title {
        display: flex;
        align-items: center;
        gap: 6px;
        min-width: 0;
        min-height: 28px;
      }
      .file-path {
        display: flex;
        align-items: baseline;
        min-width: 0;
        overflow: hidden;
      }
      .file-path-dir {
        font-size: 0.875rem;
        font-weight: 400;
        color: var(--app-text-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
      }
      .file-title {
        font-size: 0.875rem;
        font-weight: 500;
        white-space: nowrap;
        color: var(--app-text);
        flex-shrink: 0;
      }
      .dirty-dot {
        color: var(--p-primary-color, #10b981);
        font-size: 0.6rem;
        line-height: 1;
        flex-shrink: 0;
      }
      .embedding-status-icon {
        display: flex;
        align-items: center;
        flex-shrink: 0;
        font-size: 0.55rem;
        color: var(--app-text-muted);
        cursor: default;
      }
      .embedding-status-icon--has {
        color: var(--p-primary-color, #10b981);
      }
      .editor-actions {
        display: flex;
        align-items: center;
        gap: 4px;
        align-self: flex-end;
      }
      .toolbar-group {
        display: flex;
        align-items: center;
        gap: 2px;
      }
      .actions-divider {
        width: 1px;
        height: 18px;
        background: var(--app-border);
        margin: 0 6px;
        flex-shrink: 0;
      }
      .doc-actions {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .milkdown-container {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        background: var(--app-surface);
      }
      .milkdown-container {
        scrollbar-width: thin;
        scrollbar-color: var(--app-border-strong) transparent;
      }
      .raw-textarea {
        scrollbar-width: thin;
        scrollbar-color: var(--app-border-strong) transparent;
      }
      :host ::ng-deep .file-tree-panel .p-virtualscroller {
        scrollbar-width: thin;
        scrollbar-color: var(--app-border-strong) transparent;
      }
      .milkdown-container.hidden {
        display: none;
      }
      .raw-textarea {
        flex: 1;
        width: 100%;
        box-sizing: border-box;
        padding: 16px;
        font-family: monospace;
        font-size: 0.875rem;
        line-height: 1.6;
        border: none;
        outline: none;
        resize: none;
        background: var(--app-surface);
        color: var(--app-text);
        overflow-y: auto;
      }
      .placeholder {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        color: var(--app-text-muted);
        font-size: 0.95rem;
      }
      :host ::ng-deep .milkdown {
        outline: none;
        min-height: 100%;
      }
      :host ::ng-deep .milkdown .editor {
        outline: none;
        min-height: 400px;
      }
      :host ::ng-deep .milkdown a {
        cursor: pointer;
        color: var(--app-primary);
        text-decoration: underline;
      }
      :host ::ng-deep .milkdown a:hover {
        color: var(--app-primary-hover);
      }
      :host ::ng-deep .wikilink-token {
        color: var(--app-primary);
        background: var(--app-primary-soft);
        border-radius: 3px;
        padding: 1px 2px;
        cursor: pointer;
        font-weight: 500;
      }
      :host ::ng-deep .wikilink-token:hover {
        background: var(--app-primary-soft-hover);
        text-decoration: underline;
      }
      :host ::ng-deep .milkdown h1 {
        font-size: 2em;
        font-weight: 700;
        margin: 0.5em 0 0.3em;
        line-height: 1.2;
      }
      :host ::ng-deep .milkdown h2 {
        font-size: 1.5em;
        font-weight: 700;
        margin: 0.6em 0 0.3em;
        line-height: 1.3;
      }
      :host ::ng-deep .milkdown h3 {
        font-size: 1.25em;
        font-weight: 600;
        margin: 0.7em 0 0.3em;
        line-height: 1.4;
      }
      :host ::ng-deep .milkdown h4 {
        font-size: 1.05em;
        font-weight: 600;
        margin: 0.8em 0 0.25em;
      }
      :host ::ng-deep .milkdown h5 {
        font-size: 0.9em;
        font-weight: 600;
        margin: 0.9em 0 0.25em;
      }
      :host ::ng-deep .milkdown h6 {
        font-size: 0.85em;
        font-weight: 600;
        margin: 0.9em 0 0.25em;
        color: var(--app-text-muted);
      }
      :host ::ng-deep .milkdown blockquote {
        border-left: 4px solid var(--app-primary);
        margin: 0.75em 0;
        padding: 0.4em 1em;
        background: var(--app-primary-soft);
        color: var(--app-text);
        border-radius: 0 4px 4px 0;
      }
      :host ::ng-deep .milkdown ul {
        list-style: disc;
        padding-left: 1.75em;
        margin: 0.5em 0;
      }
      :host ::ng-deep .milkdown ol {
        list-style: decimal;
        padding-left: 1.75em;
        margin: 0.5em 0;
      }
      :host ::ng-deep .milkdown li {
        margin: 0.2em 0;
      }
      :host ::ng-deep .milkdown pre {
        background: var(--app-surface-subtle);
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
        background: var(--app-surface-subtle);
        padding: 0.15em 0.35em;
        border-radius: 3px;
      }
      :host ::ng-deep .milkdown hr {
        border: none;
        border-top: 2px solid var(--app-border);
        margin: 1.5em 0;
      }
      :host ::ng-deep .milkdown table {
        border-collapse: collapse;
        width: 100%;
        margin: 1em 0;
        overflow-x: auto;
        display: block;
      }
      :host ::ng-deep .milkdown table th,
      :host ::ng-deep .milkdown table td {
        border: 1px solid var(--app-border);
        padding: 0.45em 0.75em;
        text-align: left;
        vertical-align: top;
      }
      :host ::ng-deep .milkdown table thead th {
        background: var(--app-surface-subtle);
        font-weight: 600;
        color: var(--app-text);
      }
      :host ::ng-deep .milkdown table tbody tr:nth-child(even) {
        background: var(--app-surface-hover);
      }
      :host ::ng-deep .obsidian-image-embed-hidden {
        display: none;
      }
      :host ::ng-deep .obsidian-image-preview {
        margin: 18px auto;
        max-width: min(100%, 860px);
        padding: 10px;
        border: 1px solid var(--app-border);
        border-radius: 8px;
        background: var(--app-surface-subtle);
        box-shadow: 0 1px 4px rgba(15, 23, 42, 0.08);
        cursor: text;
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
      .frontmatter-panel {
        background: var(--app-surface-subtle);
        border-bottom: 1px solid var(--app-border-strong);
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
        color: var(--app-text-muted);
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .fm-actions {
        display: flex;
        gap: 4px;
        align-items: center;
      }
      .fm-toggle {
        background: none;
        border: none;
        cursor: pointer;
        font-size: 0.75rem;
        color: var(--app-text-muted);
        padding: 2px 6px;
        border-radius: 3px;
      }
      .fm-toggle:hover {
        background: var(--app-border);
        color: var(--app-text);
      }
      .fm-toggle.active {
        background: var(--app-border);
        color: var(--app-text);
      }
      .frontmatter-entries {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 4px 16px 10px;
      }
      .fm-entry {
        display: flex;
        gap: 6px;
        align-items: baseline;
      }
      .fm-key {
        font-size: 0.75rem;
        font-weight: 600;
        color: var(--app-text-muted);
      }
      .fm-value {
        font-size: 0.8rem;
        color: var(--app-text);
      }
      .fm-editor {
        padding: 4px 16px 10px;
      }
      .fm-yaml-textarea {
        width: 100%;
        min-height: 100px;
        font-family: 'Fira Code', 'Cascadia Code', monospace;
        font-size: 0.8rem;
        line-height: 1.5;
        padding: 8px;
        border: 1px solid var(--app-border-strong);
        border-radius: 4px;
        resize: vertical;
        background: var(--app-surface);
        color: var(--app-text);
        outline: none;
      }
      .fm-yaml-textarea:focus {
        border-color: var(--app-primary);
      }
      .fm-yaml-textarea.error {
        border-color: var(--app-error-text);
      }
      .fm-yaml-error {
        display: block;
        font-size: 0.75rem;
        color: var(--app-error-text);
        margin-top: 4px;
      }
      .move-help {
        margin: 0 0 8px;
        font-size: 0.85rem;
        color: var(--app-text-muted);
      }
      .move-tree-wrap {
        border: 1px solid var(--app-border-strong);
        border-radius: 6px;
        max-height: 300px;
        overflow-y: auto;
        padding: 4px 0;
      }
      .move-root-item {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        cursor: pointer;
        font-size: 0.875rem;
        border-bottom: 1px solid var(--app-border);
      }
      .move-root-item:hover {
        background: var(--app-surface-subtle);
      }
      .move-root-item.selected {
        background: var(--app-primary-soft);
        font-weight: 600;
        color: var(--app-primary);
      }
      .versions-layout {
        display: flex;
        gap: 12px;
        height: 460px;
      }
      .versions-list {
        width: 240px;
        flex-shrink: 0;
        overflow-y: auto;
        border: 1px solid var(--app-border);
        border-radius: 6px;
      }
      .version-item {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding: 8px 12px;
        cursor: pointer;
        border-bottom: 1px solid var(--app-border);
        font-size: 0.8rem;
      }
      .version-item:hover {
        background: var(--app-surface-subtle);
      }
      .version-item.active {
        background: var(--app-primary-soft);
      }
      .v-date {
        color: var(--app-text);
      }
      .v-source {
        font-size: 0.7rem;
        font-weight: 600;
        padding: 0.05rem 0.4rem;
        border-radius: 10px;
        align-self: flex-start;
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }
      .source-local {
        background: #dbeafe;
        color: #1e40af;
      }
      .source-job {
        background: #ede9fe;
        color: #6d28d9;
      }
      .source-webdav {
        background: #dcfce7;
        color: #166534;
      }
      .versions-preview {
        flex: 1;
        min-width: 0;
        overflow: auto;
        border: 1px solid var(--app-border);
        border-radius: 6px;
      }
      .version-diff {
        margin: 0;
        font-size: 0.75rem;
        line-height: 1.45;
        background: #1e1e1e;
        color: #d4d4d4;
        padding: 0.6rem;
        white-space: normal;
        overflow-x: auto;
        min-height: 100%;
      }
      .version-diff span {
        display: block;
        white-space: pre;
      }
      .version-diff .line-add {
        background: #1a3a1a;
        color: #7ee787;
      }
      .version-diff .line-del {
        background: #3a1a1a;
        color: #ff7b72;
      }
      .versions-preview .hint,
      .versions-list .hint {
        padding: 16px;
        color: var(--app-text-muted);
        font-size: 0.85rem;
      }
      .link-discovery-body {
        min-height: 80px;
      }
      .ld-progress-area {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding: 8px 0;
      }
      .ld-step-label {
        font-size: 0.875rem;
        color: var(--app-text-muted);
      }
      :host ::ng-deep .ld-bar {
        height: 8px;
        border-radius: 4px;
      }
      .ld-error,
      .ld-warn {
        display: flex;
        align-items: flex-start;
        gap: 10px;
        padding: 12px;
        border-radius: 6px;
        font-size: 0.875rem;
      }
      .ld-error {
        background: var(--app-error-bg);
        color: var(--app-error-text);
      }
      .ld-warn {
        background: var(--app-primary-soft);
        color: var(--app-text);
      }
      .ld-empty {
        color: var(--app-text-muted);
        font-size: 0.875rem;
        padding: 8px 0;
      }
      .ld-results {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-height: 380px;
        overflow-y: auto;
      }
      .ld-selection-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 10px;
      }
      .ld-selection-count {
        font-size: 0.8rem;
        color: var(--app-text-muted);
      }
      .ld-result-item {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 10px 12px;
        border: 1px solid var(--app-border);
        border-radius: 6px;
        cursor: default;
        transition: background 0.1s;
      }
      .ld-result-item:hover {
        background: var(--app-surface-subtle);
      }
      .ld-result-info {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
        flex: 1;
      }
      .ld-result-title {
        font-size: 0.875rem;
        font-weight: 500;
        color: var(--app-text);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .ld-result-path {
        font-size: 0.75rem;
        color: var(--app-text-muted);
        font-family: monospace;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .ld-result-score {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        flex-shrink: 0;
        margin-left: 12px;
      }
      .ld-score-label {
        font-size: 0.65rem;
        color: var(--app-text-subtle);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }
      .ld-score-value {
        font-size: 0.9rem;
        font-weight: 700;
        color: var(--app-primary);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ExplorerComponent implements OnInit, AfterViewInit, OnDestroy, UnsavedChangesAware {
  @ViewChild('editorContainer') editorContainer!: ElementRef<HTMLDivElement>;
  @ViewChild('fileTree') fileTree?: Tree;

  private readonly fileService = inject(FileService);
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly messageService = inject(MessageService);
  private readonly confirmationService = inject(ConfirmationService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly t = inject(TranslocoService);
  protected readonly globalSearchService = inject(GlobalSearchService);

  constructor() {
    effect(() => {
      const path = this.globalSearchService.pendingNavigation();
      if (path === null) return;
      this.globalSearchService.clearNavigation();
      const node = this.allFiles().find((n) => n.data === path);
      if (!node) {
        this.router.navigate(['explorer', ...path.split('/')]);
        return;
      }
      if (this.isDirty()) {
        this.confirmationService.confirm({
          message: this.t.translate('explorer.confirmUnsavedMessage'),
          header: this.t.translate('explorer.confirmUnsavedHeader'),
          icon: 'pi pi-exclamation-triangle',
          accept: () => this.openFile(node),
          reject: () => {},
        });
      } else {
        this.openFile(node);
      }
    });
  }

  readonly treeNodes = signal<TreeNode[]>([]);
  readonly selectedPath = signal<string | null>(null);
  readonly selectedLabel = signal<string>('');
  readonly selectedPathParts = computed(() => {
    const path = this.selectedPath();
    if (!path) return null;
    const idx = path.lastIndexOf('/');
    return idx === -1 ? { dir: '', name: path } : { dir: path.slice(0, idx + 1), name: path.slice(idx + 1) };
  });
  readonly isDirty = signal(false);
  readonly editorMode = signal<'wysiwyg' | 'raw'>('wysiwyg');
  readonly rawModeText = signal('');
  readonly embeddingStatus = signal<EmbeddingStatus | null>(null);
  readonly regeneratingKeywords = signal(false);
  readonly isKeywordEligible = computed(() => {
    const path = this.selectedPath();
    return !!path && path.startsWith('wiki/');
  });
  readonly frontmatter = signal<Record<string, unknown>>({});
  readonly frontmatterEntries = computed(() => Object.entries(this.frontmatter()));
  readonly showFrontmatter = signal(true);
  readonly editingFrontmatter = signal(false);
  readonly frontmatterRawYaml = signal('');
  readonly frontmatterYamlError = signal(false);
  readonly treePanelWidth = signal(280);
  readonly sidebarPanel = signal<'collapsed' | 'files' | 'toc' | 'graph'>(
    window.innerWidth < 768 ? 'collapsed' : 'files',
  );
  readonly treePanelCollapsed = computed(() => this.sidebarPanel() === 'collapsed');
  readonly graphSettings = signal<GraphSettings>({ ...DEFAULT_GRAPH_SETTINGS });
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
  readonly syncing = signal(false);
  readonly showVersions = signal(false);
  readonly showLinkDiscovery = signal(false);
  readonly linkDiscoveryRunning = signal(false);
  readonly linkDiscoveryError = signal<string | null>(null);
  readonly linkDiscoveryNoKeywords = signal(false);
  readonly linkDiscoveryResults = signal<DiscoveredLink[]>([]);
  readonly linkDiscoverySelected = signal<Set<string>>(new Set());
  readonly linkDiscoveryStep = signal<{ step: string; current: number; total: number } | null>(null);
  readonly linkDiscoveryPercent = computed(() => {
    const s = this.linkDiscoveryStep();
    return s ? Math.round((s.current / s.total) * 100) : 0;
  });
  readonly linkDiscoveryStepLabel = computed(() => {
    const step = this.linkDiscoveryStep()?.step;
    if (step === 'loading') return this.t.translate('explorer.linkDiscoveryStepLoading');
    if (step === 'searching') return this.t.translate('explorer.linkDiscoveryStepSearching');
    return this.t.translate('explorer.linkDiscoveryStepDone');
  });
  readonly linkDiscoveryAllSelected = computed(() => {
    const results = this.linkDiscoveryResults();
    return results.length > 0 && this.linkDiscoverySelected().size === results.length;
  });
  private linkDiscoverySub: { unsubscribe(): void } | null = null;
  readonly versions = signal<FileVersion[]>([]);
  readonly previewVersionId = signal<string | null>(null);
  readonly previewDiffLines = signal<string[]>([]);
  readonly resourceFolder = signal('');
  private previewContent = '';
  readonly dirTreeNodes = computed(() => {
    const filterDirs = (nodes: TreeNode[]): TreeNode[] =>
      nodes.filter((n) => !n.leaf).map((n) => ({ ...n, children: filterDirs(n.children ?? []) }));
    return filterDirs(this.treeNodes());
  });

  readonly allFiles = computed(() => {
    const flatten = (nodes: TreeNode[]): TreeNode[] => nodes.flatMap((n) => (n.leaf ? [n] : flatten(n.children ?? [])));
    return flatten(this.treeNodes());
  });

  selectedNode: TreeNode | null = null;
  moveTargetDirNode: TreeNode | null = null;

  readonly wikilinkQuery = signal<string | null>(null);
  readonly wikilinkCoords = signal<WikilinkCoords | null>(null);

  readonly wikilinkContextMenuVisible = signal(false);
  readonly wikilinkContextMenuX = signal(0);
  readonly wikilinkContextMenuY = signal(0);
  readonly wikilinkContextMenuTarget = signal<string | null>(null);
  readonly linkExplainModalVisible = signal(false);
  readonly linkExplainTarget = signal<string | null>(null);
  readonly wikilinkSuggestions = computed(() => {
    const q = this.wikilinkQuery();
    if (q === null) return [];
    const lower = q.toLowerCase();
    return this.allFiles()
      .filter((n) => !lower || (n.label ?? '').toLowerCase().includes(lower))
      .slice(0, 12);
  });

  private editor: Editor | null = null;
  private editorView: EditorView | null = null;
  private currentMarkdown = '';
  readonly tocMarkdown = signal('');
  readonly tocHeadings = computed(() => {
    const re = /^(#{1,6})\s+(.+)/gm;
    const results: { level: number; text: string }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(this.tocMarkdown())) !== null) {
      results.push({ level: m[1].length, text: m[2].trim() });
    }
    return results;
  });
  readonly tocTreeNodes = computed((): TreeNode[] => {
    const roots: TreeNode[] = [];
    const stack: { level: number; node: TreeNode }[] = [];
    for (const h of this.tocHeadings()) {
      const node: TreeNode = { label: h.text, data: h.text, leaf: true, expanded: true };
      while (stack.length > 0 && stack[stack.length - 1].level >= h.level) stack.pop();
      if (stack.length === 0) {
        roots.push(node);
      } else {
        const parent = stack[stack.length - 1].node;
        (parent.children ??= []).push(node);
        parent.leaf = false;
      }
      stack.push({ level: h.level, node });
    }
    return roots;
  });
  private rawFileContent = '';
  private isLoading = false;
  private treeSubscription: Subscription | null = null;
  protected isResizing = false;
  private resizeStartX = 0;
  private resizeStartWidth = 0;
  private allowDiscardOnDeactivate = false;
  private navigatingFromTree = false;

  ngOnInit(): void {
    this.route.url.pipe(skip(1), takeUntilDestroyed(this.destroyRef)).subscribe((segments) => {
      if (this.navigatingFromTree) {
        this.navigatingFromTree = false;
        return;
      }
      const filePath = segments
        .slice(1)
        .map((s) => s.path)
        .join('/');
      if (filePath) this.loadFileByPath(filePath);
    });
  }

  ngAfterViewInit(): void {
    this.loadResourceSettings();
    this.loadTree();
    this.initEditor().then(() => {
      const filePath = this.getFilePathFromRoute();
      if (filePath) this.loadFileByPath(filePath);
    });
  }

  ngOnDestroy(): void {
    this.treeSubscription?.unsubscribe();
    this.editor?.destroy();
  }

  private loadTree(): void {
    this.treeSubscription = this.fileService.getTree().subscribe({
      next: (nodes) => {
        this.treeNodes.set(nodes);
        const currentPath = this.selectedPath();
        if (currentPath) {
          const node = this.allFiles().find((n) => n.data === currentPath);
          if (node) this.selectedNode = node;
          this.revealInTree(currentPath);
        }
        this.cdr.markForCheck();
      },
      error: () =>
        this.messageService.add({
          severity: 'error',
          summary: this.t.translate('common.error'),
          detail: this.t.translate('explorer.toastErrorLoadTree'),
        }),
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
    return nodes.map((n) => ({
      ...n,
      expanded: expanded.has(n.data as string),
      children: n.children ? this.restoreExpanded(n.children, expanded) : [],
    }));
  }

  private expandAncestors(nodes: TreeNode[], filePath: string): boolean {
    let changed = false;
    for (const node of nodes) {
      if (node.leaf) continue;
      const nodePath = node.data as string;
      if (filePath === nodePath || filePath.startsWith(nodePath + '/')) {
        if (!node.expanded) {
          node.expanded = true;
          changed = true;
        }
        if (this.expandAncestors(node.children ?? [], filePath)) changed = true;
      }
    }
    return changed;
  }

  private getFlatVisibleIndex(nodes: TreeNode[], targetPath: string): number {
    let index = 0;
    const walk = (ns: TreeNode[]): boolean => {
      for (const n of ns) {
        if (n.data === targetPath) return true;
        index++;
        if (!n.leaf && n.expanded && n.children?.length) {
          if (walk(n.children)) return true;
        }
      }
      return false;
    };
    return walk(nodes) ? index : -1;
  }

  private revealInTree(path: string): void {
    if (this.navigatingFromTree) return;
    const changed = this.expandAncestors(this.treeNodes(), path);
    if (changed) this.treeNodes.update((n) => [...n]);
    setTimeout(() => {
      const idx = this.getFlatVisibleIndex(this.treeNodes(), path);
      if (idx >= 0) this.fileTree?.scroller?.scrollToIndex(idx);
    }, 0);
  }

  private reloadTree(): void {
    const expanded = this.getExpandedPaths(this.treeNodes());
    this.fileService.getTree().subscribe({
      next: (nodes) => {
        this.treeNodes.set(this.restoreExpanded(nodes, expanded));
        this.cdr.markForCheck();
      },
      error: () =>
        this.messageService.add({
          severity: 'error',
          summary: this.t.translate('common.error'),
          detail: this.t.translate('explorer.toastErrorUpdateTree'),
        }),
    });
  }

  openRenameDialog(): void {
    const node = this.contextMenuNode();
    if (!node) return;
    this.renameValue.set(node.label ?? '');
    this.showRenameDialog.set(true);
  }

  openRenameDialogFromHeader(): void {
    const path = this.selectedPath();
    if (!path) return;
    const name = path.includes('/') ? path.substring(path.lastIndexOf('/') + 1) : path;
    this.contextMenuNode.set({ label: name, data: path });
    this.renameValue.set(name);
    this.showRenameDialog.set(true);
  }

  confirmRename(): void {
    const node = this.contextMenuNode();
    const newName = this.renameValue().trim();
    if (!node || !newName) return;
    this.showRenameDialog.set(false);
    this.fileService.renameJob(node.data as string, newName).subscribe({
      next: () => {
        this.router.navigate(['/jobs']);
      },
      error: (err) => {
        const msg =
          err.status === HttpStatusCode.Conflict
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
        this.openFile(newNode);
        this.messageService.add({
          severity: 'success',
          summary: this.t.translate('explorer.toastSummaryCreated'),
          detail: this.t.translate('explorer.toastSuccessFileCreated', { name }),
        });
      },
      error: (err) => {
        const msg =
          err.status === HttpStatusCode.Conflict
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
        this.messageService.add({
          severity: 'success',
          summary: this.t.translate('explorer.toastSummaryCreated'),
          detail: this.t.translate('explorer.toastSuccessDirCreated', { name }),
        });
      },
      error: (err) => {
        const msg =
          err.status === HttpStatusCode.Conflict
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
          const segments = newPath.split('/');
          this.router.navigate(['explorer', ...segments]);
        }
        this.reloadTree();
        const dest = targetDir || '/';
        this.messageService.add({
          severity: 'success',
          summary: this.t.translate('explorer.toastSummaryMoved'),
          detail: this.t.translate('explorer.toastSuccessMoved', { name: filename, dest }),
        });
      },
      error: (err) => {
        const msg =
          err.status === HttpStatusCode.Conflict
            ? this.t.translate('explorer.toastErrorMoveConflict')
            : this.t.translate('explorer.toastErrorMove');
        this.messageService.add({ severity: 'error', summary: this.t.translate('common.error'), detail: msg });
      },
    });
  }

  deleteCurrentFile(): void {
    const path = this.selectedPath();
    const label = this.selectedLabel();
    if (!path) return;
    this.confirmationService.confirm({
      message: this.t.translate('explorer.confirmDeleteMessage', { name: label }),
      header: this.t.translate('explorer.confirmDeleteHeader'),
      icon: 'pi pi-trash',
      accept: () => {
        this.fileService.deleteFile(path).subscribe({
          next: () => {
            this.selectedPath.set(null);
            this.selectedLabel.set('');
            this.isDirty.set(false);
            if (this.editor) this.editor.action(replaceAll(''));
            this.reloadTree();
            this.messageService.add({
              severity: 'success',
              summary: this.t.translate('explorer.toastSummaryDeleted'),
              detail: this.t.translate('explorer.toastSuccessDeleted', { name: label }),
            });
          },
          error: () =>
            this.messageService.add({
              severity: 'error',
              summary: this.t.translate('common.error'),
              detail: this.t.translate('explorer.toastErrorDelete'),
            }),
        });
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
            this.messageService.add({
              severity: 'success',
              summary: this.t.translate('explorer.toastSummaryDeleted'),
              detail: this.t.translate('explorer.toastSuccessDeleted', { name: node.label }),
            });
          },
          error: () =>
            this.messageService.add({
              severity: 'error',
              summary: this.t.translate('common.error'),
              detail: this.t.translate('explorer.toastErrorDelete'),
            }),
        });
      },
    });
  }

  private initEditor(): Promise<void> {
    return Editor.make()
      .config((ctx) => {
        ctx.set(rootCtx, this.editorContainer.nativeElement);
        ctx.set(defaultValueCtx, '');
        ctx.set(editorViewOptionsCtx, { attributes: { spellcheck: 'false' } });
        ctx.get(listenerCtx).markdownUpdated((_ctx, rawMarkdown) => {
          const markdown = rawMarkdown.replace(/\\\[\\\[([^\]]*?)(?:\\\]\\\]|\]\])/g, '[[$1]]');
          if (this.isLoading) {
            this.isLoading = false;
            this.currentMarkdown = markdown;
            this.tocMarkdown.set(markdown);
            return;
          }
          if (this.selectedPath() && markdown !== this.currentMarkdown) {
            this.isDirty.set(true);
            this.cdr.markForCheck();
          }
          this.currentMarkdown = markdown;
          this.tocMarkdown.set(markdown);
        });
      })
      .use(commonmark)
      .use(gfm)
      .use(history)
      .use(listener)
      .use(createMarkdownImagePlugin())
      .use(createMarkdownLinkPlugin())
      .use(createLivePreviewPlugin())
      .use(createImageResourceViewPlugin({ getToken: () => this.auth.token() }))
      .use(
        createClipboardImagePlugin({
          uploadImage: (file) => this.api.uploadImage(file),
          onError: (msg) =>
            this.messageService.add({
              severity: 'error',
              summary: this.t.translate('common.error'),
              detail: msg,
            }),
        }),
      )
      .use(
        createObsidianImagePreviewPlugin({
          getResourceFolder: () => this.resourceFolder(),
          getToken: () => this.auth.token(),
        }),
      )
      .use(
        createWikilinkPlugin({
          onNavigate: (target) => this.navigateToWikilink(target),
          onAutocomplete: (query, coords, view) => {
            this.editorView = view;
            this.wikilinkQuery.set(query);
            this.wikilinkCoords.set(coords);
            this.cdr.markForCheck();
          },
          onContextMenu: (target, x, y) => {
            this.wikilinkContextMenuTarget.set(target);
            this.wikilinkContextMenuX.set(x);
            this.wikilinkContextMenuY.set(y);
            this.wikilinkContextMenuVisible.set(true);
            this.cdr.markForCheck();
          },
        }),
      )
      .create()
      .then((editor) => {
        this.editor = editor;
      });
  }

  private loadResourceSettings(): void {
    this.api.getResourceSettings().subscribe({
      next: (settings) => {
        this.resourceFolder.set(settings.resourceFolder);
        this.refreshObsidianImagePreview();
      },
      error: () => {},
    });
  }

  private refreshObsidianImagePreview(): void {
    if (!this.editor) return;
    this.editor.action((ctx) => {
      const view = ctx.get(editorViewCtx);
      view.dispatch(view.state.tr.setMeta(OBSIDIAN_IMAGE_PREVIEW_REFRESH, true));
    });
  }

  private getFilePathFromRoute(): string | null {
    const segments = this.route.snapshot.url;
    if (segments.length <= 1) return null;
    return segments
      .slice(1)
      .map((s) => s.path)
      .join('/');
  }

  private loadFileByPath(path: string): void {
    const label = path.split('/').pop() ?? path;
    this.embeddingStatus.set(null);
    this.api.getEmbeddingStatus(path).subscribe({
      next: (status) => this.embeddingStatus.set(status),
      error: () => {},
    });
    this.fileService.getContent(path).subscribe({
      next: (rawContent) => {
        const parsed = this.parseFrontmatter(rawContent);
        this.editorMode.set('wysiwyg');
        this.selectedPath.set(path);
        this.selectedLabel.set(label);
        this.isDirty.set(false);
        this.rawFileContent = rawContent;
        this.frontmatter.set(parsed.data);
        this.editingFrontmatter.set(false);
        this.frontmatterYamlError.set(false);
        this.currentMarkdown = parsed.content;
        this.tocMarkdown.set(parsed.content);
        if (this.editor) {
          this.isLoading = true;
          this.editor.action(replaceAll(parsed.content));
        }
        const node = this.allFiles().find((n) => n.data === path);
        if (node) this.selectedNode = node;
        this.revealInTree(path);
        this.cdr.markForCheck();
      },
      error: () =>
        this.messageService.add({
          severity: 'error',
          summary: this.t.translate('common.error'),
          detail: this.t.translate('explorer.toastErrorLoadTree'),
        }),
    });
  }

  private openFile(node: TreeNode): void {
    this.navigatingFromTree = true;
    if (window.innerWidth < 768) this.sidebarPanel.set('collapsed');
    this.loadFile(node);
    const segments = (node.data as string).split('/');
    this.router.navigate(['explorer', ...segments]);
  }

  onNodeContextMenuSelect(event: { node: TreeNode }): void {
    const node = event.node;
    this.contextMenuNode.set(node);
    if (node.leaf) {
      this.contextMenuItems.set([
        {
          label: this.t.translate('explorer.contextMenuRename'),
          icon: 'pi pi-pencil',
          command: () => this.openRenameDialog(),
        },
        {
          label: this.t.translate('explorer.contextMenuMove'),
          icon: 'pi pi-folder-open',
          command: () => this.openMoveDialog(),
        },
        {
          label: this.t.translate('explorer.contextMenuDelete'),
          icon: 'pi pi-trash',
          command: () => this.deleteNode(),
        },
      ]);
    } else {
      this.contextMenuItems.set([
        {
          label: this.t.translate('explorer.contextMenuCreateFile'),
          icon: 'pi pi-file-plus',
          command: () => this.openCreateDialog(),
        },
        {
          label: this.t.translate('explorer.contextMenuCreateDir'),
          icon: 'pi pi-folder-plus',
          command: () => this.openCreateDirDialog(),
        },
      ]);
    }
  }

  onNodeSelect(event: { node: TreeNode }): void {
    const node = event.node;
    if (!node.leaf) return;

    if (this.isDirty()) {
      const previousNode = this.selectedNode;
      this.confirmationService.confirm({
        message: this.t.translate('explorer.confirmUnsavedMessage'),
        header: this.t.translate('explorer.confirmUnsavedHeader'),
        icon: 'pi pi-exclamation-triangle',
        accept: () => this.openFile(node),
        reject: () => {
          this.selectedNode = previousNode;
          this.cdr.markForCheck();
        },
      });
    } else {
      this.openFile(node);
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
      next: (rawContent) => {
        const parsed = this.parseFrontmatter(rawContent);
        this.editorMode.set('wysiwyg');
        this.selectedPath.set(path);
        this.selectedLabel.set(node.label ?? path);
        this.isDirty.set(false);
        this.rawFileContent = rawContent;
        this.frontmatter.set(parsed.data);
        this.editingFrontmatter.set(false);
        this.frontmatterYamlError.set(false);
        this.currentMarkdown = parsed.content;
        this.tocMarkdown.set(parsed.content);
        if (this.editor) {
          this.isLoading = true;
          this.editor.action(replaceAll(parsed.content));
        }
        this.cdr.markForCheck();
      },
      error: () =>
        this.messageService.add({
          severity: 'error',
          summary: this.t.translate('common.error'),
          detail: this.t.translate('explorer.toastErrorLoadTree'),
        }),
    });
  }

  toggleFrontmatter(): void {
    this.showFrontmatter.update((v) => !v);
    if (!this.showFrontmatter()) this.editingFrontmatter.set(false);
  }

  toggleFrontmatterEdit(): void {
    if (!this.editingFrontmatter()) {
      this.frontmatterRawYaml.set(stringifyYaml(this.frontmatter()));
      this.frontmatterYamlError.set(false);
    }
    this.editingFrontmatter.update((v) => !v);
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

  toggleSidebarPanel(mode: 'files' | 'toc' | 'graph'): void {
    this.sidebarPanel.set(this.sidebarPanel() === mode ? 'collapsed' : mode);
  }

  onGraphSettingsChange(settings: GraphSettings): void {
    this.graphSettings.set(settings);
  }

  toggleEditorMode(): void {
    if (this.editorMode() === 'wysiwyg') {
      this.rawModeText.set(this.currentFullContent());
      this.editorMode.set('raw');
    } else {
      const raw = this.rawModeText();
      const parsed = this.parseFrontmatter(raw);
      this.frontmatter.set(parsed.data);
      this.frontmatterRawYaml.set(raw.startsWith('---') ? (raw.split('---')[1] ?? '') : '');
      this.currentMarkdown = parsed.content;
      this.tocMarkdown.set(parsed.content);
      if (this.editor) {
        this.isLoading = true;
        this.editor.action(replaceAll(parsed.content));
      }
      if (raw !== this.rawFileContent) this.isDirty.set(true);
      this.editorMode.set('wysiwyg');
    }
  }

  scrollToHeading(text: string): void {
    const headings = this.editorContainer.nativeElement.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6');
    const target = Array.from(headings).find((el) => el.textContent?.trim() === text);
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  onTocNodeSelect(event: { node: TreeNode }): void {
    this.scrollToHeading(event.node.data as string);
  }

  navigateToWikilink(target: string): void {
    const label = target.toLowerCase();
    const file =
      this.allFiles().find(
        (n) =>
          ((n.data as string) ?? '').toLowerCase().replace(/\.md$/i, '') === label ||
          ((n.data as string) ?? '').toLowerCase() === label,
      ) ??
      this.allFiles().find(
        (n) => (n.label ?? '').toLowerCase().replace(/\.md$/i, '') === label || (n.label ?? '').toLowerCase() === label,
      );
    if (!file) {
      this.messageService.add({
        severity: 'warn',
        summary: this.t.translate('explorer.toastSummaryBrokenLink'),
        detail: this.t.translate('explorer.toastBrokenLink', { target }),
      });
      return;
    }
    if (this.isDirty()) {
      this.confirmationService.confirm({
        message: this.t.translate('explorer.confirmUnsavedNavigate'),
        header: this.t.translate('explorer.confirmUnsavedHeader'),
        icon: 'pi pi-exclamation-triangle',
        accept: () => this.openFile(file),
        reject: () => {},
      });
    } else {
      this.openFile(file);
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

  @HostListener('window:resize')
  onWindowResize(): void {
    if (window.innerWidth < 768 && !this.treePanelCollapsed()) {
      this.sidebarPanel.set('collapsed');
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.wikilinkQuery() !== null) this.closeWikilinkDropdown();
    if (this.wikilinkContextMenuVisible()) this.wikilinkContextMenuVisible.set(false);
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.wikilinkContextMenuVisible()) this.wikilinkContextMenuVisible.set(false);
  }

  openLinkExplainModal(): void {
    this.wikilinkContextMenuVisible.set(false);
    const rawTarget = this.wikilinkContextMenuTarget();
    const resolvedPath = rawTarget ? this.resolveWikilinkPath(rawTarget) : null;
    this.linkExplainTarget.set(resolvedPath);
    this.linkExplainModalVisible.set(true);
  }

  private resolveWikilinkPath(target: string): string | null {
    const label = target.toLowerCase();
    const file =
      this.allFiles().find(
        (n) =>
          ((n.data as string) ?? '').toLowerCase().replace(/\.md$/i, '') === label ||
          ((n.data as string) ?? '').toLowerCase() === label,
      ) ??
      this.allFiles().find(
        (n) => (n.label ?? '').toLowerCase().replace(/\.md$/i, '') === label || (n.label ?? '').toLowerCase() === label,
      );
    return file ? (file.data as string) : null;
  }

  @HostListener('document:keydown.control.s', ['$event'])
  onCtrlS(event: Event): void {
    event.preventDefault();
    if (this.isDirty()) this.save();
  }

  @HostListener('document:keydown.control.shift.s', ['$event'])
  onCtrlShiftS(event: Event): void {
    event.preventDefault();
    this.sync();
  }

  @HostListener('window:beforeunload', ['$event'])
  onBeforeUnload(event: BeforeUnloadEvent): void {
    if (!this.isDirty()) return;
    event.preventDefault();
    event.returnValue = '';
  }

  canDeactivate(): boolean {
    if (!this.isDirty() || this.allowDiscardOnDeactivate) return true;
    return window.confirm(this.t.translate('explorer.confirmUnsavedNavigate'));
  }

  private confirmDiscardChanges(action: () => void): void {
    if (!this.isDirty()) {
      action();
      return;
    }

    this.confirmationService.confirm({
      message: this.t.translate('explorer.confirmUnsavedNavigate'),
      header: this.t.translate('explorer.confirmUnsavedHeader'),
      icon: 'pi pi-exclamation-triangle',
      accept: () => {
        this.allowDiscardOnDeactivate = true;
        action();
      },
    });
  }

  insertTable(): void {
    if (!this.editor) return;
    this.editor.action((ctx) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const view = (ctx as any).get('editorView') as EditorView;
      if (view) insertTableAtCursor(view);
    });
  }

  save(): void {
    const path = this.selectedPath();
    if (!path) return;
    const fm = this.frontmatter();
    const fullContent =
      this.editorMode() === 'raw'
        ? this.rawModeText()
        : Object.keys(fm).length > 0
          ? this.stringifyWithFrontmatter(this.currentMarkdown, fm)
          : this.currentMarkdown;
    this.fileService.saveContent(path, fullContent).subscribe({
      next: () => {
        this.isDirty.set(false);
        this.rawFileContent = fullContent;
        this.messageService.add({
          severity: 'success',
          summary: this.t.translate('explorer.toastSummaryGuardado'),
          detail: this.t.translate('explorer.toastSuccessSaved'),
        });
        this.cdr.markForCheck();
      },
      error: (err) => {
        if (err?.status === HttpStatusCode.BadGateway) {
          // Saved locally + recorded in history, but not replicated to WebDAV.
          this.isDirty.set(false);
          this.messageService.add({
            severity: 'warn',
            summary: this.t.translate('explorer.toastSummaryGuardado'),
            detail: this.t.translate('explorer.toastSavedNotReplicated'),
          });
          this.cdr.markForCheck();
        } else {
          this.messageService.add({
            severity: 'error',
            summary: this.t.translate('common.error'),
            detail: this.t.translate('explorer.toastErrorSave'),
          });
        }
      },
    });
  }

  openVersions(): void {
    const path = this.selectedPath();
    if (!path) return;
    this.previewVersionId.set(null);
    this.previewDiffLines.set([]);
    this.previewContent = '';
    this.versions.set([]);
    this.showVersions.set(true);
    this.fileService.getVersions(path).subscribe({
      next: (versions) => {
        this.versions.set(versions);
        this.cdr.markForCheck();
      },
      error: () =>
        this.messageService.add({
          severity: 'error',
          summary: this.t.translate('common.error'),
          detail: this.t.translate('versions.errorLoad'),
        }),
    });
  }

  selectVersion(version: FileVersion): void {
    const path = this.selectedPath();
    if (!path) return;
    this.fileService.getVersionContent(path, version.versionId).subscribe({
      next: (rawContent) => {
        const content = rawContent.replace(/\\\[\\\[([^\]]*)\\\]\\\]/g, '[[$1]]');
        this.previewVersionId.set(version.versionId);
        this.previewContent = content;
        this.previewDiffLines.set(this.lineDiff(this.rawFileContent, content));
        this.cdr.markForCheck();
      },
      error: () =>
        this.messageService.add({
          severity: 'error',
          summary: this.t.translate('common.error'),
          detail: this.t.translate('versions.errorLoad'),
        }),
    });
  }

  restoreVersion(): void {
    const path = this.selectedPath();
    if (!path || !this.previewVersionId()) return;
    const content = this.previewContent;
    this.fileService.saveContent(path, content).subscribe({
      next: () => {
        const parsed = this.parseFrontmatter(content);
        this.rawFileContent = content;
        this.frontmatter.set(parsed.data);
        this.editingFrontmatter.set(false);
        this.currentMarkdown = parsed.content;
        this.tocMarkdown.set(parsed.content);
        if (this.editor) {
          this.isLoading = true;
          this.editor.action(replaceAll(parsed.content));
        }
        this.isDirty.set(false);
        this.showVersions.set(false);
        this.messageService.add({
          severity: 'success',
          summary: this.t.translate('explorer.toastSummaryGuardado'),
          detail: this.t.translate('versions.restored'),
        });
        this.cdr.markForCheck();
      },
      error: (err) => {
        if (err?.status === HttpStatusCode.BadGateway) {
          this.showVersions.set(false);
          this.messageService.add({
            severity: 'warn',
            summary: this.t.translate('explorer.toastSummaryGuardado'),
            detail: this.t.translate('explorer.toastSavedNotReplicated'),
          });
        } else {
          this.messageService.add({
            severity: 'error',
            summary: this.t.translate('common.error'),
            detail: this.t.translate('explorer.toastErrorSave'),
          });
        }
      },
    });
  }

  private currentFullContent(): string {
    const fm = this.frontmatter();
    return Object.keys(fm).length > 0 ? this.stringifyWithFrontmatter(this.currentMarkdown, fm) : this.currentMarkdown;
  }

  /** Minimal LCS-based line diff of the previewed version against the current content. */
  private lineDiff(current: string, version: string): string[] {
    const a = current.split('\n');
    const b = version.split('\n');
    const n = a.length;
    const m = b.length;
    const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
    const out: string[] = [];
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) {
        out.push(' ' + a[i]);
        i++;
        j++;
      } else if (dp[i + 1][j] >= dp[i][j + 1]) {
        out.push('-' + a[i]);
        i++;
      } else {
        out.push('+' + b[j]);
        j++;
      }
    }
    while (i < n) {
      out.push('-' + a[i]);
      i++;
    }
    while (j < m) {
      out.push('+' + b[j]);
      j++;
    }
    return out;
  }

  diffLineClass(line: string): string {
    if (line.startsWith('+')) return 'line-add';
    if (line.startsWith('-')) return 'line-del';
    return '';
  }

  sourceLabel(source: string): string {
    return this.t.translate('git.source.' + source);
  }

  sourceClass(source: string): string {
    switch (source) {
      case 'LOCAL_EDIT':
        return 'source-local';
      case 'WEBDAV_PULL':
        return 'source-webdav';
      default:
        return 'source-job';
    }
  }

  formatDate(dateStr: string): string {
    try {
      return new Date(dateStr).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return dateStr;
    }
  }

  sync(): void {
    if (this.syncing()) return;
    this.syncing.set(true);
    this.api.syncWebdav().subscribe({
      next: (event) => {
        if (event.type === 'done') {
          const { pulled, deleted, conflicts } = event.result;
          this.messageService.add({
            severity: conflicts.length > 0 ? 'warn' : 'success',
            summary: this.t.translate('sync.button'),
            detail: this.t.translate('sync.summary', {
              pulled: pulled.length,
              deleted: deleted.length,
              conflicts: conflicts.length,
            }),
          });
          if (pulled.length > 0 || deleted.length > 0) this.reloadTree();
        }
      },
      complete: () => {
        this.syncing.set(false);
        this.cdr.markForCheck();
      },
      error: (err: { code?: string; message?: string }) => {
        this.syncing.set(false);
        const detail =
          err?.code === 'NOT_CONFIGURED' ? this.t.translate('sync.notConfigured') : this.t.translate('sync.error');
        this.messageService.add({ severity: 'error', summary: this.t.translate('common.error'), detail });
        this.cdr.markForCheck();
      },
    });
  }

  openLinkDiscovery(): void {
    const path = this.selectedPath();
    if (!path) return;
    const fm = this.frontmatter();
    const hasKeywords = Array.isArray(fm['keywords']) && (fm['keywords'] as unknown[]).length > 0;
    this.linkDiscoveryResults.set([]);
    this.linkDiscoverySelected.set(new Set());
    this.linkDiscoveryError.set(null);
    this.linkDiscoveryStep.set(null);
    this.linkDiscoveryNoKeywords.set(!hasKeywords);
    this.showLinkDiscovery.set(true);
    if (!hasKeywords) return;
    this.linkDiscoveryRunning.set(true);
    this.linkDiscoverySub = this.api.discoverLinks(path).subscribe({
      next: (event) => {
        if (event.type === 'progress') {
          this.linkDiscoveryStep.set({ step: event.step, current: event.current, total: event.total });
        } else if (event.type === 'done') {
          const wikilinkRe = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
          const existingSlugs = new Set<string>();
          let m: RegExpExecArray | null;
          while ((m = wikilinkRe.exec(this.currentMarkdown)) !== null) {
            existingSlugs.add(m[1].trim());
          }
          const filtered = event.links.filter((l) => !existingSlugs.has(this.slugFromPath(l.path)));
          this.linkDiscoveryResults.set(filtered);
          this.linkDiscoveryRunning.set(false);
        }
        this.cdr.markForCheck();
      },
      error: (err: { message?: string }) => {
        this.linkDiscoveryError.set(err.message ?? this.t.translate('explorer.linkDiscoveryError'));
        this.linkDiscoveryRunning.set(false);
        this.cdr.markForCheck();
      },
    });
  }

  onLinkDiscoveryHide(): void {
    this.linkDiscoverySub?.unsubscribe();
    this.linkDiscoverySub = null;
    this.linkDiscoveryRunning.set(false);
  }

  navigateToDiscoveredLink(path: string): void {
    const node = this.allFiles().find((n) => n.data === path);
    if (node) {
      this.showLinkDiscovery.set(false);
      this.openFile(node);
    }
  }

  isLinkDiscoverySelected(path: string): boolean {
    return this.linkDiscoverySelected().has(path);
  }

  toggleLinkDiscovery(path: string): void {
    this.linkDiscoverySelected.update((set) => {
      const next = new Set(set);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  toggleAllLinkDiscovery(): void {
    if (this.linkDiscoveryAllSelected()) {
      this.linkDiscoverySelected.set(new Set());
    } else {
      this.linkDiscoverySelected.set(new Set(this.linkDiscoveryResults().map((l) => l.path)));
    }
  }

  private slugFromPath(path: string): string {
    const filename = path.split('/').pop() ?? path;
    return filename.replace(/\.md$/i, '');
  }

  addSelectedLinksToRelated(): void {
    const selected = this.linkDiscoverySelected();
    if (selected.size === 0) return;

    const slugsToAdd = Array.from(selected).map((p) => this.slugFromPath(p));
    let markdown = this.currentMarkdown;

    const relatedMatch = markdown.match(/^## Related\s*\n([\s\S]*?)(?=^## |\s*$)/m);
    const existingSlugs = new Set<string>();

    if (relatedMatch) {
      const block = relatedMatch[1];
      const wikilinkRe = /\[\[([^\]|]+)(?:\|[^\]]*)?\]\]/g;
      let m: RegExpExecArray | null;
      while ((m = wikilinkRe.exec(block)) !== null) {
        existingSlugs.add(m[1].trim());
      }

      const newLines = slugsToAdd
        .filter((s) => !existingSlugs.has(s))
        .map((s) => `- [[${s}]]`)
        .join('\n');

      if (newLines) {
        const insertAt = relatedMatch.index! + relatedMatch[0].trimEnd().length;
        markdown = markdown.slice(0, insertAt) + '\n' + newLines + markdown.slice(insertAt);
      }
    } else {
      const newSection = '\n\n## Related\n' + slugsToAdd.map((s) => `- [[${s}]]`).join('\n');
      const sourcesIdx = markdown.search(/^## Sources\b/m);
      if (sourcesIdx !== -1) {
        markdown = markdown.slice(0, sourcesIdx).trimEnd() + newSection + '\n\n' + markdown.slice(sourcesIdx);
      } else {
        markdown = markdown.trimEnd() + newSection;
      }
    }

    this.currentMarkdown = markdown;
    this.tocMarkdown.set(markdown);
    this.editor?.action(replaceAll(markdown));
    this.isDirty.set(true);
    this.save();
    this.showLinkDiscovery.set(false);
  }

  generatePdf(): void {
    const path = this.selectedPath();
    if (!path) return;
    this.fileService.exportPdf(path).subscribe({
      next: (blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const name = this.selectedLabel().replace(/\.md$/i, '');
        a.download = name + '.pdf';
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () =>
        this.messageService.add({
          severity: 'error',
          summary: this.t.translate('common.error'),
          detail: this.t.translate('explorer.toastErrorPdf'),
        }),
    });
  }

  regenerateKeywords(): void {
    const path = this.selectedPath();
    if (!path) return;
    this.regeneratingKeywords.set(true);
    this.api.regenerateKeywords([path]).subscribe({
      next: () => {
        this.regeneratingKeywords.set(false);
        this.router.navigate(['/jobs']);
      },
      error: () => {
        this.regeneratingKeywords.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudo encolar la regeneración de keywords.',
        });
      },
    });
  }

  enrich(): void {
    const path = this.selectedPath();
    if (!path) return;
    this.confirmationService.confirm({
      header: this.t.translate('explorer.enrichConfirmHeader'),
      message: this.t.translate('explorer.enrichConfirmMessage'),
      icon: 'pi pi-sparkles',
      accept: () => this.doEnqueue(path),
    });
  }

  private doEnqueue(path: string): void {
    const enqueue = () => {
      this.api.enqueueEnrich(path).subscribe({
        next: () => this.router.navigate(['/jobs']),
        error: () =>
          this.messageService.add({
            severity: 'error',
            summary: this.t.translate('common.error'),
            detail: this.t.translate('explorer.toastErrorEnrich'),
          }),
      });
    };
    if (!this.isDirty()) {
      enqueue();
      return;
    }
    const fm = this.frontmatter();
    const fullContent =
      Object.keys(fm).length > 0 ? this.stringifyWithFrontmatter(this.currentMarkdown, fm) : this.currentMarkdown;
    this.fileService.saveContent(path, fullContent).subscribe({
      next: () => {
        this.isDirty.set(false);
        this.rawFileContent = fullContent;
        this.cdr.markForCheck();
        enqueue();
      },
      error: () =>
        this.messageService.add({
          severity: 'error',
          summary: this.t.translate('common.error'),
          detail: this.t.translate('explorer.toastErrorSave'),
        }),
    });
  }
}
