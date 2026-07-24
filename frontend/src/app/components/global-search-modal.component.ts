import { ChangeDetectionStrategy, Component, computed, effect, HostListener, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { TreeNode } from 'primeng/api';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TranslocoPipe } from '@jsverse/transloco';
import { FileService } from '../services/file.service';
import { GlobalSearchService } from '../services/global-search.service';

@Component({
  selector: 'app-global-search-modal',
  standalone: true,
  imports: [DialogModule, InputTextModule, TranslocoPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <p-dialog
      [header]="'explorer.searchFile' | transloco"
      [visible]="searchService.isOpen()"
      (visibleChange)="onVisibleChange($event)"
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
          (input)="onSearchInput($any($event.target).value)"
          (keydown)="onSearchKeyDown($event)"
        />
      </div>
      <div class="search-results">
        @if (filteredFiles().length === 0) {
          <p class="search-empty">{{ 'explorer.noResults' | transloco }}</p>
        }
        @for (file of filteredFiles(); track file.data; let i = $index) {
          <div class="search-result" [class.is-active]="searchHighlightIndex() === i" (click)="selectFile(file)">
            <i class="pi pi-file"></i>
            <span class="search-result-info">
              <span [innerHTML]="file.label"></span>
              @if (searchResultPath(file); as dir) {
                <span class="search-result-path">{{ dir }}</span>
              }
            </span>
          </div>
        }
      </div>
    </p-dialog>
  `,
  styles: [
    `
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
        align-items: flex-start;
        gap: 8px;
        padding: 8px 10px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 0.875rem;
        color: var(--app-text);
        transition: background 0.1s;
      }
      .search-result:hover {
        background: var(--app-surface-subtle);
      }
      .search-result.is-active {
        background: var(--app-primary-soft);
        color: var(--app-primary);
      }
      .search-result .pi {
        color: var(--app-text-muted);
        font-size: 0.8rem;
        flex-shrink: 0;
      }
      .search-result-info {
        display: flex;
        flex-direction: column;
        min-width: 0;
        flex: 1;
      }
      .search-result-path {
        font-size: 0.75rem;
        color: var(--app-text-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .search-empty {
        text-align: center;
        color: var(--app-text-muted);
        font-size: 0.875rem;
        padding: 24px 0;
      }
    `,
  ],
})
export class GlobalSearchModalComponent {
  protected readonly searchService = inject(GlobalSearchService);
  private readonly fileService = inject(FileService);
  private readonly router = inject(Router);

  readonly searchQuery = signal('');
  readonly searchHighlightIndex = signal<number>(-1);
  private readonly treeNodes = signal<TreeNode[]>([]);

  readonly allFiles = computed(() => {
    const flatten = (nodes: TreeNode[]): TreeNode[] => nodes.flatMap((n) => (n.leaf ? [n] : flatten(n.children ?? [])));
    return flatten(this.treeNodes());
  });

  readonly filteredFiles = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    return q ? this.allFiles().filter((n) => (n.data as string).toLowerCase().includes(q)) : this.allFiles();
  });

  constructor() {
    effect(() => {
      if (this.searchService.isOpen()) {
        this.searchQuery.set('');
        this.searchHighlightIndex.set(-1);
        this.fileService.getTree().subscribe((nodes) => this.treeNodes.set(nodes));
      }
    });

    effect(() => {
      const path = this.searchService.pendingNavigation();
      if (path !== null && !this.router.url.startsWith('/explorer')) {
        this.searchService.clearNavigation();
        this.router.navigate(['explorer', ...path.split('/')]);
      }
    });
  }

  @HostListener('document:keydown.control.p', ['$event'])
  onCtrlP(event: Event): void {
    const target = event.target as HTMLElement;
    if (target.closest('.cm-editor')) return;
    event.preventDefault();
    this.searchService.open();
  }

  onVisibleChange(visible: boolean): void {
    if (!visible) this.searchService.close();
  }

  onSearchInput(value: string): void {
    this.searchQuery.set(value);
    this.searchHighlightIndex.set(-1);
  }

  onSearchKeyDown(event: KeyboardEvent): void {
    const count = this.filteredFiles().length;
    if (count === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.searchHighlightIndex.update((i) => (i + 1) % count);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.searchHighlightIndex.update((i) => (i <= 0 ? count - 1 : i - 1));
    } else if (event.key === 'Enter') {
      this.selectHighlightedResult();
    }
  }

  selectHighlightedResult(): void {
    const idx = this.searchHighlightIndex();
    if (idx === -1) return;
    const file = this.filteredFiles()[idx];
    if (file) this.selectFile(file);
  }

  selectFile(node: TreeNode): void {
    this.searchService.selectFile(node.data as string);
  }

  searchResultPath(node: TreeNode): string {
    const path = node.data as string;
    const idx = path.lastIndexOf('/');
    return idx === -1 ? '' : path.slice(0, idx + 1);
  }
}
