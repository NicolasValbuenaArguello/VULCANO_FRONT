import { Directive, EventEmitter, HostListener, Input, OnDestroy, Output, inject } from '@angular/core';
import { WindowManagerService, WindowRect } from './window-manager.service';

type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** Comportamiento comun de ventanas; conserva el gestor existente y libera los HostListener. */
@Directive()
export abstract class FloatingWindowBase implements OnDestroy {
  readonly manager = inject(WindowManagerService);
  readonly edges: Edge[] = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
  @Input() zIndex = 5200;
  @Output() closed = new EventEmitter<void>();
  @Output() activated = new EventEmitter<void>();
  private gesture?: { pointerId: number; x: number; y: number; rect: WindowRect; edge?: Edge; target: HTMLElement };

  protected constructor(readonly id: string, title: string, initialWidth = 900, initialHeight = 600) {
    this.manager.register(this.id, title, 420, 300);
    this.measure();
    const { width, height } = this.manager.bounds();
    const w = Math.min(initialWidth, width * 0.9);
    const h = Math.min(initialHeight, height * 0.8);
    this.manager.float(this.id, { x: (width - w) / 2, y: (height - h) / 2, width: w, height: h });
  }

  /** Proyecta la geometría conservada al área visible; minimizar solo oculta el cuerpo. */
  get rect(): WindowRect { return this.manager.visibleRect(this.manager.get(this.id)!); }

  /** Restaura la misma instancia desde el menú, conservando tamaño y maximización. */
  restore(): void { this.manager.restore(this.id); this.activated.emit(); }

  /** Conserva la geometría normal y deja el encabezado disponible para restaurar. */
  minimize(): void { this.stopPointer(); this.manager.minimize(this.id); }

  /** Alterna entre el área disponible y el rectángulo normal guardado. */
  toggleMaximize(): void { this.stopPointer(); this.manager.toggleMaximize(this.id); }

  /** Solicita al menú destruir la instancia y libera cualquier captura activa. */
  close(): void { this.stopPointer(); this.closed.emit(); }

  /** Actualiza los límites al cambiar el viewport o entrar/salir de pantalla completa. */
  @HostListener('window:resize')
  @HostListener('document:fullscreenchange')
  measure(): void { this.manager.setBounds(window.innerWidth, window.innerHeight); }

  /** Inicia arrastre o redimensionamiento únicamente con el botón principal. */
  startPointer(event: PointerEvent, edge?: Edge): void {
    const state = this.manager.get(this.id)!;
    if (event.button !== 0 || state.maximized || (edge && state.minimized) || (event.target as Element).closest('button')) return;
    event.preventDefault();
    event.stopPropagation();
    this.stopPointer();
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture?.(event.pointerId);
    this.gesture = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, rect: this.rect, edge, target };
    this.activated.emit();
  }

  /** Aplica los ocho bordes/esquinas y limita la posición mediante el gestor existente. */
  @HostListener('window:pointermove', ['$event'])
  movePointer(event: PointerEvent): void {
    const drag = this.gesture;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const { rect, edge } = drag;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    let next = { ...rect, x: rect.x + dx, y: rect.y + dy };
    if (edge) {
      const bounds = this.manager.bounds();
      const minW = Math.min(420, bounds.width);
      const minH = Math.min(300, bounds.height);
      const left = edge.includes('w') ? Math.max(0, Math.min(rect.x + dx, rect.x + rect.width - minW)) : rect.x;
      const top = edge.includes('n') ? Math.max(0, Math.min(rect.y + dy, rect.y + rect.height - minH)) : rect.y;
      const right = edge.includes('e') ? Math.max(left + minW, Math.min(bounds.width, rect.x + rect.width + dx)) : rect.x + rect.width;
      const bottom = edge.includes('s') ? Math.max(top + minH, Math.min(bounds.height, rect.y + rect.height + dy)) : rect.y + rect.height;
      next = { x: left, y: top, width: right - left, height: bottom - top };
    }
    this.manager.setRect(this.id, next);
  }

  /** Confirma la posición final y libera la captura al terminar o cancelar el gesto. */
  @HostListener('window:pointerup', ['$event'])
  @HostListener('window:pointercancel', ['$event'])
  endPointer(event: PointerEvent): void {
    if (this.gesture?.pointerId !== event.pointerId) return;
    if (event.type !== 'pointercancel') this.movePointer(event);
    this.stopPointer();
  }

  /** Cancela capturas al perder el foco, minimizar, cerrar o destruir. */
  @HostListener('window:blur')
  stopPointer(): void {
    const drag = this.gesture;
    if (drag?.target.hasPointerCapture?.(drag.pointerId)) drag.target.releasePointerCapture(drag.pointerId);
    this.gesture = undefined;
  }

  /** Angular retira los HostListener; el gestor descarta el registro de esta ventana. */
  ngOnDestroy(): void { this.stopPointer(); this.manager.unregister(this.id); }
}
