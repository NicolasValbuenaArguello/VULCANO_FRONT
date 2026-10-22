import { Injectable, NgZone, OnDestroy, inject, signal } from '@angular/core';
import { Subject } from 'rxjs';

export interface GeographicPoint { latitud: number; longitud: number; }
export interface MapActionRequest { action: 'graficar' | 'proyectar'; point: GeographicPoint; host: HTMLElement; }

/** Valida coordenadas geograficas reales sin sustituir puntos invalidos por valores por defecto. */
export function validGeographicPoint(point: GeographicPoint): boolean {
  return Number.isFinite(point.latitud) && Number.isFinite(point.longitud)
    && Math.abs(point.latitud) <= 90 && Math.abs(point.longitud) <= 180;
}

/** Respeta controles, marcadores y dialogos que ya gestionan sus propios gestos. */
export function mapActionTarget(target: EventTarget | null): boolean {
  return !(target instanceof Element && target.closest(
    'button, input, select, textarea, a, [role="dialog"], .leaflet-control, .leaflet-marker-icon, .maplibregl-control-container, .maplibregl-marker, .project-modal-backdrop, .floating-window',
  ));
}

/** Un solo menu y punto seleccionado para ambos visores; nunca confirma ni almacena elementos. */
@Injectable({ providedIn: 'root' })
export class MapActionsService implements OnDestroy {
  private readonly zone = inject(NgZone);
  private readonly pointState = signal<GeographicPoint | null>(null);
  readonly selectedPoint = this.pointState.asReadonly();
  private readonly requests = new Subject<MapActionRequest>();
  readonly requested$ = this.requests.asObservable();
  private menu?: HTMLElement;
  private host?: HTMLElement;
  private cleanups: (() => void)[] = [];

  /** Situa el unico menu dentro del mapa y evita el menu nativo solamente en esa superficie. */
  open(host: HTMLElement, point: GeographicPoint, event: MouseEvent): void {
    this.close();
    if (!validGeographicPoint(point) || !mapActionTarget(event.target)) return;
    event.preventDefault();
    this.pointState.set({ ...point });
    this.host = host;
    const menu = document.createElement('div');
    this.menu = menu;
    menu.className = 'vulcano-map-context-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'Acciones del mapa');
    const heading = document.createElement('strong');
    heading.textContent = 'ACCIONES DEL MAPA';
    const coordinates = document.createElement('small');
    coordinates.textContent = `${point.latitud.toFixed(6)}, ${point.longitud.toFixed(6)}`;
    menu.append(heading, coordinates);
    for (const action of ['graficar', 'proyectar'] as const) {
      const button = document.createElement('button');
      button.type = 'button';
      button.setAttribute('role', 'menuitem');
      const icon = document.createElement('span');
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = action === 'graficar' ? '＋' : '↗';
      button.append(icon, document.createTextNode(action.toUpperCase()));
      button.addEventListener('click', () => {
        const selected = this.selectedPoint();
        this.close();
        if (selected) this.zone.run(() => this.requests.next({ action, point: selected, host }));
      });
      menu.append(button);
    }
    for (const name of ['pointerdown', 'mousedown', 'dblclick', 'wheel', 'contextmenu']) {
      this.listen(menu, name, event => { event.stopPropagation(); if (name === 'contextmenu') event.preventDefault(); });
    }
    this.listen(document, 'pointerdown', event => { if (!menu.contains(event.target as Node)) this.close(); }, true);
    this.listen(document, 'keydown', event => {
      const key = (event as KeyboardEvent).key;
      if (key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(); host.focus({ preventScroll: true }); }
      if ((key === 'ArrowDown' || key === 'ArrowUp') && menu.contains(document.activeElement)) {
        event.preventDefault();
        const buttons = [...menu.querySelectorAll('button')];
        const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
        buttons[(index + (key === 'ArrowDown' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
      }
    }, true);
    host.append(menu);
    const rect = host.getBoundingClientRect();
    menu.style.left = `${Math.max(4, Math.min(event.clientX - rect.left, (host.clientWidth || rect.width) - menu.offsetWidth - 4))}px`;
    menu.style.top = `${Math.max(4, Math.min(event.clientY - rect.top, (host.clientHeight || rect.height) - menu.offsetHeight - 4))}px`;
    menu.querySelector('button')?.focus({ preventScroll: true });
  }

  /** Cierra solo el menu de este visor al moverlo, ocultarlo o destruirlo. */
  closeFor(host: HTMLElement): void { if (this.host === host) this.close(); }

  /** Libera el punto temporal y los eventos sin modificar ventanas ni formularios abiertos. */
  close(): void {
    this.cleanups.splice(0).forEach(cleanup => cleanup());
    this.menu?.remove();
    this.menu = undefined;
    this.host = undefined;
    this.pointState.set(null);
  }

  /** Registra eventos temporales con limpieza para que nunca se acumulen entre aperturas. */
  private listen(target: EventTarget, name: string, listener: EventListener, capture = false): void {
    target.addEventListener(name, listener, capture);
    this.cleanups.push(() => target.removeEventListener(name, listener, capture));
  }

  /** Destruir la aplicacion elimina el menu singleton y su canal de solicitudes. */
  ngOnDestroy(): void { this.close(); this.requests.complete(); }
}
