import { Injectable, computed, signal } from '@angular/core';

export interface WindowRect { x: number; y: number; width: number; height: number; }
export interface PanelWindow {
  id: string;
  title: string;
  mode: 'integrated' | 'floating';
  minimized: boolean;
  maximized: boolean;
  rect: WindowRect;
  minWidth: number;
  minHeight: number;
  z: number;
}

/** Estado de presentacion local a una Hoja; nunca almacena ni reinicia datos de sus paneles. */
@Injectable()
export class WindowManagerService {
  private readonly state = signal<readonly PanelWindow[]>([]);
  readonly windows = this.state.asReadonly();
  readonly floating = computed(() => this.windows().filter(window => window.mode === 'floating'));
  readonly activeId = signal<string | null>(null);
  readonly bounds = signal({ width: 900, height: 600 });
  readonly surface = signal<HTMLElement | null>(null);
  private nextZ = 1;

  /** Registra una identidad unica; la instancia del contenido pertenece a Angular. */
  register(id: string, title: string, minWidth = 280, minHeight = 200): void {
    if (this.windows().some(window => window.id === id)) throw new Error(`Ventana duplicada: ${id}`);
    this.state.update(windows => [...windows, {
      id, title, minWidth, minHeight, mode: 'integrated', minimized: false,
      maximized: false, rect: { x: 16, y: 16, width: 440, height: 340 }, z: 0,
    }]);
  }

  /** Elimina solo el registro cuando Angular destruye definitivamente su panel. */
  unregister(id: string): void {
    this.state.update(windows => windows.filter(window => window.id !== id));
    if (this.activeId() === id) this.selectNext();
  }

  /** Consulta el estado por identidad sin crear otra ventana. */
  get(id: string): PanelWindow | undefined { return this.windows().find(window => window.id === id); }

  /** Abre la misma instancia y conserva la geometria de aperturas anteriores. */
  float(id: string, initial?: WindowRect): void {
    const window = this.get(id);
    if (!window) return;
    this.patch(id, { mode: 'floating', minimized: false, maximized: false,
      rect: this.clamp(initial ?? window.rect, window) });
    this.front(id);
  }

  /** Cerrar y volver al panel comparten esta operacion, sin destruir su contenido. */
  dock(id: string): void {
    this.patch(id, { mode: 'integrated', minimized: false, maximized: false });
    if (this.activeId() === id) this.selectNext();
  }

  /** Oculta la presentacion, manteniendo geometria, instancia y maximizado. */
  minimize(id: string): void {
    this.patch(id, { minimized: true });
    if (this.activeId() === id) this.selectNext();
  }

  /** Restaura desde la barra y eleva la misma ventana. */
  restore(id: string): void { this.patch(id, { minimized: false }); this.front(id); }

  /** Maximizar no sobreescribe el rectangulo normal, que se recupera al restaurar. */
  toggleMaximize(id: string): void {
    const window = this.get(id);
    if (!window) return;
    this.patch(id, { maximized: !window.maximized, minimized: false });
    this.front(id);
  }

  /** Mantiene un orden visual comun para todas las ventanas de esta Hoja. */
  front(id: string): void {
    const window = this.get(id);
    if (!window || window.mode !== 'floating' || window.minimized) return;
    this.patch(id, { z: ++this.nextZ });
    this.activeId.set(id);
  }

  /** Aplica movimiento o tamano dentro del area visible; el contenido no interviene. */
  setRect(id: string, rect: WindowRect): void {
    const window = this.get(id);
    if (window && !window.maximized) this.patch(id, { rect: this.clamp(rect, window) });
  }

  /** Actualiza limites al redimensionar el visor o cambiar fullscreen, sin reiniciar ventanas. */
  setBounds(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.bounds.set({ width, height });
  }

  /** Proyecta la geometria guardada al espacio actual sin perderla al cambiar de pantalla. */
  visibleRect(window: PanelWindow): WindowRect {
    return window.maximized ? { x: 0, y: 0, ...this.bounds() } : this.clamp(window.rect, window);
  }

  /** Limita posicion y dimensiones, admitiendo visores menores al minimo preferido. */
  private clamp(rect: WindowRect, window: PanelWindow): WindowRect {
    const bounds = this.bounds();
    const width = Math.min(bounds.width, Math.max(window.minWidth, rect.width));
    const height = Math.min(bounds.height, Math.max(window.minHeight, rect.height));
    return { width, height, x: Math.max(0, Math.min(rect.x, bounds.width - width)),
      y: Math.max(0, Math.min(rect.y, bounds.height - height)) };
  }

  /** Actualiza exclusivamente los metadatos de una ventana. */
  private patch(id: string, patch: Partial<PanelWindow>): void {
    this.state.update(windows => windows.map(window => window.id === id ? { ...window, ...patch } : window));
  }

  /** Selecciona la siguiente ventana visible tras minimizar o integrar la activa. */
  private selectNext(): void {
    const visible = this.floating().filter(window => !window.minimized).sort((a, b) => b.z - a.z);
    this.activeId.set(visible[0]?.id ?? null);
  }
}
