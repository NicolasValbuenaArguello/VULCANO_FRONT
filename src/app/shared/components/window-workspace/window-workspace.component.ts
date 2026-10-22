import { AfterViewInit, Component, ElementRef, HostListener, OnDestroy, ViewChild, inject } from '@angular/core';
import { WindowManagerService } from './window-manager.service';

/** Area persistente dentro de la Hoja y de su elemento fullscreen; no crea contenido de paneles. */
@Component({
  selector: 'app-window-workspace',
  standalone: true,
  template: `
    <div #surface class="window-workspace-surface"></div>
    @if (manager.floating().length) {
      <nav class="window-workspace-taskbar" aria-label="Ventanas activas">
        @for (window of manager.floating(); track window.id) {
          <button type="button" [class.window-task-active]="manager.activeId() === window.id"
            [attr.aria-pressed]="manager.activeId() === window.id"
            [attr.aria-label]="(window.minimized ? 'Restaurar ' : 'Activar ') + window.title"
            (click)="manager.restore(window.id)">
            <span aria-hidden="true">{{ window.minimized ? '—' : '□' }}</span> {{ window.title }}
          </button>
        }
      </nav>
    }
  `,
})
export class WindowWorkspaceComponent implements AfterViewInit, OnDestroy {
  readonly manager = inject(WindowManagerService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  @ViewChild('surface', { static: true }) private surface!: ElementRef<HTMLElement>;
  private observer?: ResizeObserver;

  /** Registra el destino unico y observa el area y los controles que deben quedar accesibles. */
  ngAfterViewInit(): void {
    this.manager.surface.set(this.surface.nativeElement);
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(() => this.measure());
      this.observer.observe(this.host.nativeElement.parentElement!);
      const footer = this.host.nativeElement.parentElement?.querySelector('.local-plane-footer');
      if (footer) this.observer.observe(footer);
    }
    this.measure();
  }

  /** Fullscreen y cambios del viewport solo modifican limites de presentacion. */
  @HostListener('document:fullscreenchange')
  @HostListener('window:resize')
  measure(): void {
    const host = this.host.nativeElement;
    const footer = host.parentElement?.querySelector('.local-plane-footer');
    host.style.bottom = `${Math.ceil(footer?.getBoundingClientRect().height ?? 0) + 16}px`;
    const rect = this.surface.nativeElement.getBoundingClientRect();
    this.manager.setBounds(rect.width, rect.height);
  }

  /** Reutiliza el acceso de la barra inferior y cierra su menu nativo sin alterar otras ventanas. */
  activate(id: string, launcher: HTMLDetailsElement): void {
    if (this.manager.get(id)?.mode === 'integrated') this.manager.float(id);
    else this.manager.restore(id);
    launcher.open = false;
  }

  /** Libera observadores al destruir la Hoja; minimizar nunca ejecuta esta limpieza. */
  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.manager.surface.set(null);
  }
}
