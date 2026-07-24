import { Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class GlobalSearchService {
  readonly isOpen = signal(false);
  readonly pendingNavigation = signal<string | null>(null);

  open(): void {
    this.isOpen.set(true);
  }

  close(): void {
    this.isOpen.set(false);
  }

  selectFile(path: string): void {
    this.pendingNavigation.set(path);
    this.isOpen.set(false);
  }

  clearNavigation(): void {
    this.pendingNavigation.set(null);
  }
}
