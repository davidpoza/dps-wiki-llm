import {
  AfterViewInit,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  inject,
  OnDestroy,
  signal,
  ViewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { Editor, defaultValueCtx, rootCtx } from '@milkdown/core';
import { listener, listenerCtx } from '@milkdown/plugin-listener';
import { commonmark } from '@milkdown/preset-commonmark';
import { replaceAll } from '@milkdown/utils';
import { TreeNode, ConfirmationService, MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { TreeModule } from 'primeng/tree';
import { Subscription } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { FileService } from '../services/file.service';

@Component({
  selector: 'app-explorer',
  standalone: true,
  imports: [TreeModule, ButtonModule, ToastModule, ConfirmDialogModule],
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
        <aside class="file-tree-panel">
          <p-tree
            [value]="treeNodes()"
            selectionMode="single"
            [(selection)]="selectedNode"
            (onNodeSelect)="onNodeSelect($event)"
            styleClass="w-full"
          />
          @if (treeNodes().length === 0) {
            <p class="empty-msg">No hay documentos</p>
          }
        </aside>

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
          }
          <div #editorContainer class="milkdown-container" [class.hidden]="!selectedPath()"></div>
          @if (!selectedPath()) {
            <div class="placeholder">Selecciona un fichero para editarlo</div>
          }
        </section>
      </div>
    </main>
  `,
  styles: [`
    .explorer-shell {
      min-height: 100vh;
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
      width: 280px;
      min-width: 200px;
      border-right: 1px solid #e2e5ea;
      background: #fff;
      overflow-y: auto;
      padding: 8px;
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

  selectedNode: TreeNode | null = null;

  private editor: Editor | null = null;
  private currentMarkdown = '';
  private treeSubscription: Subscription | null = null;

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
        ctx.get(listenerCtx).markdownUpdated((_ctx, markdown) => {
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

  private loadFile(node: TreeNode): void {
    const path = node.data as string;
    this.fileService.getContent(path).subscribe({
      next: content => {
        this.selectedPath.set(path);
        this.selectedLabel.set(node.label ?? path);
        this.isDirty.set(false);
        this.currentMarkdown = content;
        if (this.editor) {
          this.editor.action(replaceAll(content));
        }
        this.cdr.markForCheck();
      },
      error: () =>
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el fichero' }),
    });
  }

  @HostListener('document:keydown.control.s', ['$event'])
  onCtrlS(event: Event): void {
    event.preventDefault();
    if (this.isDirty()) this.save();
  }

  save(): void {
    const path = this.selectedPath();
    if (!path) return;
    this.fileService.saveContent(path, this.currentMarkdown).subscribe({
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
