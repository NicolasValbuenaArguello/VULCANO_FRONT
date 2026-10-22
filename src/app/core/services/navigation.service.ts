import { DestroyRef, Injectable, inject, signal } from '@angular/core';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../auth/auth.service';

export interface NavigationLog {
  from: string;
  to: string;
  timestamp: Date;
  user?: string | null;
}

@Injectable({
  providedIn: 'root',
})
export class NavigationService {
  readonly logs = signal<NavigationLog[]>([]);

  private previousUrl = '/';
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    this.previousUrl = this.router.url || '/';

    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((event) => {
        const nextUrl = event.urlAfterRedirects || event.url;
        const entry: NavigationLog = {
          from: this.previousUrl,
          to: nextUrl,
          timestamp: new Date(),
          user: this.authService.getCurrentUser()?.usuario ?? null,
        };

        this.logs.update((current) => [...current, entry]);
        this.previousUrl = nextUrl;
      });
  }
}
