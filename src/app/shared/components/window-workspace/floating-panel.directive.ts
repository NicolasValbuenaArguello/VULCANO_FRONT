import { AfterViewInit, Directive, ElementRef, Input, NgZone, OnDestroy, effect, inject } from '@angular/core';
import { PanelWindow, WindowManagerService, WindowRect } from './window-manager.service';

type Edge = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/** Traslada el mismo elemento y sus nodos Angular; nunca crea otra vista del panel. */
@Directive({ selector: '[appFloatingPanel]', standalone: true })
export class FloatingPanelDirective implements AfterViewInit, OnDestroy {
  @Input({ required: true }) appFloatingPanel!: string;
  @Input({ required: true }) windowTitle!: string;
  @Input() windowMinWidth = 280;
  @Input() windowMinHeight = 200;
  private readonly manager = inject(WindowManagerService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly zone = inject(NgZone);
  private anchor?: Comment;
  private detachButton?: HTMLButtonElement;
  private toolbar?: HTMLElement;
  private content?: HTMLElement;
  private readonly handles: HTMLElement[] = [];
  private originalStyle: string | null = null;
  private originalRole: string | null = null;
  private floating = false;
  private opened = false;
  private readonly cleanups: (() => void)[] = [];
  private readonly floatingCleanups: (() => void)[] = [];
  private drag?: { pointerId: number; x: number; y: number; rect: WindowRect; edge?: Edge; target: HTMLElement };
  private frame = 0;
  private pending?: { x: number; y: number };
  private readonly move = (event: PointerEvent) => this.onPointerMove(event);
  private readonly end = (event: PointerEvent) => this.onPointerEnd(event);

  private readonly presentation = effect(() => {
    const state = this.manager.get(this.appFloatingPanel);
    const surface = this.manager.surface();
    this.manager.bounds();
    const active = this.manager.activeId();
    if (!state || !this.anchor) return;
    if (state.mode === 'floating' && surface) {
      if (!this.floating) this.mount(surface);
      this.render(state, active === state.id);
    } else if (this.floating) this.unmount();
  });

  /** Registra el panel y agrega un unico acceso al encabezado existente. */
  ngAfterViewInit(): void {
    this.originalStyle = this.host.getAttribute('style');
    this.originalRole = this.host.getAttribute('role');
    this.anchor = document.createComment(`panel:${this.appFloatingPanel}`);
    this.host.before(this.anchor);
    this.detachButton = this.button('↗', `Abrir ${this.windowTitle} como ventana`, () => this.open());
    this.detachButton.className = 'window-detach-button';
    (this.host.querySelector('header') ?? this.host).append(this.detachButton);
    this.manager.register(this.appFloatingPanel, this.windowTitle, this.windowMinWidth, this.windowMinHeight);
    this.listen(this.host, 'pointerdown', () => {
      if (this.floating) this.manager.front(this.appFloatingPanel);
    });
  }

  /** Toma el tamano actual solo en la primera apertura y conserva el de aperturas posteriores. */
  private open(): void {
    const rect = this.host.getBoundingClientRect();
    const offset = this.manager.floating().length * 24;
    this.manager.float(this.appFloatingPanel, this.opened ? undefined : {
      x: 12 + offset, y: 12 + offset,
      width: Math.max(this.windowMinWidth, rect.width || 440),
      height: Math.max(this.windowMinHeight, (rect.height || 300) + 40),
    });
    this.opened = true;
  }

  /** Mueve los mismos nodos al destino fullscreen y agrega solo la estructura de ventana. */
  private mount(surface: HTMLElement): void {
    this.floating = true;
    this.opened = true;
    this.detachButton!.hidden = true;
    this.content = document.createElement('div');
    this.content.className = 'window-panel-content';
    this.content.append(...Array.from(this.host.childNodes));
    this.toolbar = document.createElement('header');
    this.toolbar.className = 'window-titlebar';
    const title = document.createElement('span');
    title.className = 'window-title';
    title.textContent = this.windowTitle;
    const actions = document.createElement('div');
    actions.className = 'window-actions';
    actions.append(
      this.button('—', `Minimizar ${this.windowTitle}`, () => this.manager.minimize(this.appFloatingPanel)),
      this.button('□', `Maximizar ${this.windowTitle}`, () => this.manager.toggleMaximize(this.appFloatingPanel)),
      this.button('↙', `Volver ${this.windowTitle} al panel`, () => this.manager.dock(this.appFloatingPanel)),
      this.button('×', `Cerrar ventana ${this.windowTitle}`, () => this.manager.dock(this.appFloatingPanel)),
    );
    this.toolbar.append(title, actions);
    this.host.append(this.toolbar, this.content);
    for (const edge of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'] as Edge[]) {
      const handle = document.createElement('div');
      handle.className = `window-resize-handle window-resize-${edge}`;
      handle.dataset['edge'] = edge;
      handle.setAttribute('aria-hidden', 'true');
      this.listen(handle, 'pointerdown', event => this.startPointer(event as PointerEvent, edge));
      this.host.append(handle);
      this.handles.push(handle);
    }
    this.listen(this.toolbar, 'pointerdown', event => this.startPointer(event as PointerEvent));
    this.host.classList.add('vulcano-floating-panel');
    this.host.setAttribute('role', 'dialog');
    surface.append(this.host);
  }

  /** Devuelve los nodos a su ancla original sin destruir vistas, formularios ni graficos. */
  private unmount(): void {
    this.stopPointer();
    this.floatingCleanups.splice(0).forEach(cleanup => cleanup());
    this.toolbar?.remove();
    this.handles.splice(0).forEach(handle => handle.remove());
    if (this.content) {
      this.content.before(...Array.from(this.content.childNodes));
      this.content.remove();
    }
    this.toolbar = undefined;
    this.content = undefined;
    this.host.classList.remove('vulcano-floating-panel', 'window-is-active', 'window-is-maximized');
    this.host.hidden = false;
    this.host.inert = false;
    this.host.removeAttribute('aria-hidden');
    if (this.originalStyle === null) this.host.removeAttribute('style');
    else this.host.setAttribute('style', this.originalStyle);
    if (this.originalRole === null) this.host.removeAttribute('role');
    else this.host.setAttribute('role', this.originalRole);
    this.anchor?.after(this.host);
    this.detachButton!.hidden = false;
    this.floating = false;
  }

  /** Aplica unicamente la geometria y visibilidad de presentacion. */
  private render(state: PanelWindow, active: boolean): void {
    if (state.minimized && this.host.contains(document.activeElement)) (document.activeElement as HTMLElement)?.blur();
    this.host.hidden = state.minimized;
    this.host.inert = state.minimized;
    this.host.setAttribute('aria-hidden', String(state.minimized));
    this.host.classList.toggle('window-is-active', active);
    this.host.classList.toggle('window-is-maximized', state.maximized);
    const rect = this.manager.visibleRect(state);
    Object.assign(this.host.style, { left: `${rect.x}px`, top: `${rect.y}px`,
      width: `${rect.width}px`, height: `${rect.height}px`, zIndex: String(state.z) });
    const maximize = this.toolbar?.querySelectorAll('button')[1];
    maximize?.setAttribute('aria-label', `${state.maximized ? 'Restaurar' : 'Maximizar'} ${this.windowTitle}`);
    if (maximize) maximize.title = maximize.getAttribute('aria-label')!;
  }

  /** Inicia arrastre solo en barra o bordes; formularios y botones conservan sus eventos. */
  private startPointer(event: PointerEvent, edge?: Edge): void {
    const state = this.manager.get(this.appFloatingPanel);
    if (!state || state.maximized || event.button !== 0 || (event.target as Element).closest('button, input, select, textarea, a')) return;
    event.preventDefault();
    this.stopPointer();
    this.manager.front(this.appFloatingPanel);
    const target = event.currentTarget as HTMLElement;
    target.setPointerCapture?.(event.pointerId);
    this.drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY,
      rect: this.manager.visibleRect(state), edge, target };
    this.zone.runOutsideAngular(() => {
      window.addEventListener('pointermove', this.move);
      window.addEventListener('pointerup', this.end);
      window.addEventListener('pointercancel', this.end);
      window.addEventListener('blur', this.cancelPointer);
    });
  }

  /** Agrupa movimientos a un cambio por frame sin ejecutar calculos del panel. */
  private onPointerMove(event: PointerEvent): void {
    if (event.pointerId !== this.drag?.pointerId) return;
    this.pending = { x: event.clientX, y: event.clientY };
    if (!this.frame) this.frame = requestAnimationFrame(() => this.flushPointer());
  }

  /** Calcula bordes y esquinas respecto a la geometria de inicio, sin deformar SVG. */
  private flushPointer(): void {
    this.frame = 0;
    if (!this.drag || !this.pending) return;
    const { rect, edge } = this.drag;
    const dx = this.pending.x - this.drag.x;
    const dy = this.pending.y - this.drag.y;
    const state = this.manager.get(this.appFloatingPanel)!;
    const bounds = this.manager.bounds();
    let next = { ...rect, x: rect.x + dx, y: rect.y + dy };
    if (edge) {
      const minW = Math.min(state.minWidth, bounds.width);
      const minH = Math.min(state.minHeight, bounds.height);
      const left = edge.includes('w') ? Math.max(0, Math.min(rect.x + dx, rect.x + rect.width - minW)) : rect.x;
      const top = edge.includes('n') ? Math.max(0, Math.min(rect.y + dy, rect.y + rect.height - minH)) : rect.y;
      const right = edge.includes('e') ? Math.max(left + minW, Math.min(bounds.width, rect.x + rect.width + dx)) : rect.x + rect.width;
      const bottom = edge.includes('s') ? Math.max(top + minH, Math.min(bounds.height, rect.y + rect.height + dy)) : rect.y + rect.height;
      next = { x: left, y: top, width: right - left, height: bottom - top };
    }
    this.zone.run(() => this.manager.setRect(this.appFloatingPanel, next));
  }

  /** Confirma el ultimo movimiento y libera captura incluso con cancelacion del navegador. */
  private onPointerEnd(event: PointerEvent): void {
    if (event.pointerId !== this.drag?.pointerId) return;
    if (this.frame) cancelAnimationFrame(this.frame);
    if (event.type !== 'pointercancel') this.pending = { x: event.clientX, y: event.clientY };
    this.flushPointer();
    this.stopPointer();
  }

  /** Cancela el gesto si el navegador pierde el foco. */
  private readonly cancelPointer = () => this.stopPointer();

  /** Detiene listeners y frames al integrar, cancelar o destruir la ventana. */
  private stopPointer(): void {
    if (this.frame) cancelAnimationFrame(this.frame);
    this.frame = 0;
    if (this.drag?.target.hasPointerCapture?.(this.drag.pointerId)) this.drag.target.releasePointerCapture(this.drag.pointerId);
    this.drag = undefined;
    this.pending = undefined;
    window.removeEventListener('pointermove', this.move);
    window.removeEventListener('pointerup', this.end);
    window.removeEventListener('pointercancel', this.end);
    window.removeEventListener('blur', this.cancelPointer);
  }

  /** Fabrica controles de presentacion accesibles, sin interferir con los del contenido. */
  private button(text: string, label: string, action: () => void): HTMLButtonElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = text;
    button.title = label;
    button.setAttribute('aria-label', label);
    this.listen(button, 'click', event => { event.stopPropagation(); action(); });
    return button;
  }

  /** Registra eventos con su limpieza para no acumular suscripciones al alternar modos. */
  private listen(target: HTMLElement, name: string, listener: EventListener): void {
    target.addEventListener(name, listener);
    (this.floating ? this.floatingCleanups : this.cleanups).push(() => target.removeEventListener(name, listener));
  }

  /** Destruir la Hoja restaura antes el DOM original y libera exclusivamente esta presentacion. */
  ngOnDestroy(): void {
    this.presentation.destroy();
    this.stopPointer();
    if (this.floating) this.unmount();
    this.cleanups.splice(0).forEach(cleanup => cleanup());
    this.detachButton?.remove();
    this.anchor?.remove();
    this.manager.unregister(this.appFloatingPanel);
  }
}
