import { ChangeDetectionStrategy, Component, DestroyRef, effect, HostListener, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router } from '@angular/router';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TranslocoPipe } from '@jsverse/transloco';
import { Subject, of } from 'rxjs';
import { catchError, debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { ApiService, FileSearchResult, FrontmatterFilter } from '../services/api.service';
import { GlobalSearchService } from '../services/global-search.service';

const SEARCH_LIMIT = 15;
const SNIPPET_BEFORE = 40;
const SNIPPET_AFTER = 80;

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
      [style]="{ width: '480px', maxWidth: '92vw' }"
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
      @if (activeFilters().length) {
        <div class="search-filters">
          <span class="search-filters-label">{{ 'explorer.searchFiltersLabel' | transloco }}</span>
          @for (filter of activeFilters(); track filter.key + ':' + filter.value) {
            <span class="search-filter-chip">{{ filter.key }}: {{ filter.value }}</span>
          }
        </div>
      }
      <div class="search-results">
        @if (results().length === 0 && (searchText().trim() || activeFilters().length)) {
          <p class="search-empty">{{ 'explorer.noResults' | transloco }}</p>
        }
        @for (result of results(); track result.path; let i = $index) {
          <div class="search-result" [class.is-active]="searchHighlightIndex() === i" (click)="selectResult(result)">
            <i class="pi pi-file"></i>
            <span class="search-result-info">
              <span class="search-result-title">{{ result.title || result.path }}</span>
              @if (snippetFor(result); as snippet) {
                <span class="search-result-snippet">{{ snippet }}</span>
              }
              <span class="search-result-path">{{ result.path }}</span>
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
      .search-filters {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
        margin-bottom: 10px;
      }
      .search-filters-label {
        font-size: 0.75rem;
        color: var(--app-text-muted);
      }
      .search-filter-chip {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: 10px;
        font-size: 0.75rem;
        background: var(--app-primary-soft);
        color: var(--app-primary);
        white-space: nowrap;
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
        margin-top: 2px;
      }
      .search-result-info {
        display: flex;
        flex-direction: column;
        min-width: 0;
        flex: 1;
      }
      .search-result-title {
        font-weight: 500;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .search-result-snippet {
        font-size: 0.75rem;
        color: var(--app-text-muted);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
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
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly searchQuery = signal('');
  readonly searchText = signal('');
  readonly activeFilters = signal<FrontmatterFilter[]>([]);
  readonly searchHighlightIndex = signal<number>(-1);
  readonly results = signal<FileSearchResult[]>([]);

  private readonly queries = new Subject<string>();

  constructor() {
    this.queries
      .pipe(
        debounceTime(200),
        distinctUntilChanged(),
        switchMap((raw) => {
          const { text, filters } = this.parseQuery(raw);
          if (!text && filters.length === 0) {
            return of<FileSearchResult[]>([]);
          }
          return this.api.lookupFiles(text, SEARCH_LIMIT, filters).pipe(catchError(() => of([])));
        }),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((res) => {
        this.results.set(res);
        this.searchHighlightIndex.set(-1);
      });

    effect(() => {
      if (this.searchService.isOpen()) {
        this.searchQuery.set('');
        this.searchText.set('');
        this.activeFilters.set([]);
        this.results.set([]);
        this.searchHighlightIndex.set(-1);
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
    const { text, filters } = this.parseQuery(value);
    this.searchText.set(text);
    this.activeFilters.set(filters);
    this.searchHighlightIndex.set(-1);
    if (!text && filters.length === 0) {
      this.results.set([]);
    }
    this.queries.next(value);
  }

  /**
   * Splits the raw input into free-text and Obsidian-style `[key: value]` frontmatter filters.
   * Tokens are removed from the text; whatever remains (whitespace-collapsed) is the text query.
   */
  private parseQuery(raw: string): { text: string; filters: FrontmatterFilter[] } {
    const filters: FrontmatterFilter[] = [];
    const text = raw
      .replace(/\[\s*([^:\]]+?)\s*:\s*([^\]]*?)\s*\]/g, (_match, key: string, value: string) => {
        const k = key.trim();
        const v = value.trim();
        if (k && v) {
          filters.push({ key: k, value: v });
        }
        return ' ';
      })
      .replace(/\s+/g, ' ')
      .trim();
    return { text, filters };
  }

  onSearchKeyDown(event: KeyboardEvent): void {
    const count = this.results().length;
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
    const result = this.results()[idx];
    if (result) this.selectResult(result);
  }

  selectResult(result: FileSearchResult): void {
    this.searchService.selectFile(result.path);
  }

  snippetFor(result: FileSearchResult): string {
    const body = result.body ?? '';
    if (!body) return '';
    const flat = body.replace(/\s+/g, ' ').trim();
    const q = this.searchText().trim().toLowerCase();
    const at = q ? flat.toLowerCase().indexOf(q) : -1;
    if (at === -1) {
      return flat.slice(0, SNIPPET_BEFORE + SNIPPET_AFTER).trim();
    }
    const start = Math.max(0, at - SNIPPET_BEFORE);
    const end = Math.min(flat.length, at + q.length + SNIPPET_AFTER);
    return (start > 0 ? '…' : '') + flat.slice(start, end).trim() + (end < flat.length ? '…' : '');
  }
}
