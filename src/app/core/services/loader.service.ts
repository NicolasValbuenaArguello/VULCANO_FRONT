import { computed, Injectable, signal } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class LoaderService {
  private readonly operations = signal<ReadonlyMap<symbol, string>>(new Map());
  readonly pendingRequests = computed(() => this.operations().size);
  readonly loading = computed(() => this.pendingRequests() > 0);
  readonly activeOperations = computed(() => [...this.operations().values()]);

  isActive(name: string): boolean { return this.activeOperations().includes(name); }

  acquire(name: string): () => void {
    const token = Symbol(name);
    this.operations.update(current => new Map(current).set(token, name));
    return () => {
      if (!this.operations().has(token)) return;
      this.operations.update(current => {
        const remaining = new Map(current);
        remaining.delete(token);
        return remaining;
      });
    };
  }
}
