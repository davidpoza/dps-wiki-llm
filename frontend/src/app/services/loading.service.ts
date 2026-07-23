import { computed, Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LoadingService {
  private readonly _count = signal(0);
  readonly active = computed(() => this._count() > 0);

  increment(): void {
    this._count.update((n) => n + 1);
  }
  decrement(): void {
    this._count.update((n) => Math.max(0, n - 1));
  }
}
