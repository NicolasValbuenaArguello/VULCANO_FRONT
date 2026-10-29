import { VentanaLimitesSeguridad } from '../ventana-limites-seguridad/ventana-limites-seguridad';
import {
  AfterViewInit,
  Component,
  ChangeDetectorRef,
  ElementRef,
  EventEmitter,
  HostListener,
  Input,
  NgZone,
  OnDestroy,
  Output,
  ViewChild,
  inject,
} from '@angular/core';
import { Graficar } from '../graficar/graficar';
import { VentanaPuntos } from '../ventana-puntos/ventana-puntos';
import { VentanaSistemasArtilleria } from '../ventana-sistemas-artilleria/ventana-sistemas-artilleria';
import { Iconos } from '../iconos/iconos';
import { RegistroCoordenada } from '../../../core/services/vulcano-api.service';
import { IconosService } from '../../../shared/services/iconos.service';
import { GeographicPoint, validGeographicPoint } from '../../../shared/components/map-context-menu/map-actions.service';
import type { FeaturePoligono } from
  '../ventana-limites-seguridad/ventana-limites-seguridad';


interface MenuOption {
  id: number;
  name: string;
  action: string;
  route?: string;
}

type VistaPrincipal = '2d' | '3d' | 'hoja-milimetrada';
type FloatingWindowKey = 'graficar' | 'iconos';

@Component({
  selector: 'app-menu',
  standalone: true,
  imports: [Graficar, Iconos, VentanaSistemasArtilleria, VentanaLimitesSeguridad, VentanaPuntos],
  templateUrl: './menu.html',
  styleUrls: ['./menu.css'],
})
export class Menu implements AfterViewInit, OnDestroy {

  
  @Input() coordenadaMapaSeleccionada: GeographicPoint | null = null;
  @Input() capturaCoordenadasActiva = false;
  @Input() cantidadCapturasVisuales = 0;
  @Output() limpiarCapturaVisual = new EventEmitter<void>();
  @Output() capturaCoordenadasActivaChange = new EventEmitter<boolean>();
  private readonly changeDetector = inject(ChangeDetectorRef);
  coordenadasGraficar: GeographicPoint | null = null;
  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);
  @ViewChild('floatingWindowsHost', { static: true })
  private readonly floatingWindowsHostRef!: ElementRef<HTMLElement>;

  /** Situa las ventanas existentes en el contenedor visible al iniciar la vista. */
  ngAfterViewInit(): void {
    this.syncFloatingWindowsHost();
  }

  /** Traslada las mismas ventanas al elemento fullscreen y las restaura al salir. */
  @HostListener('document:fullscreenchange')
  syncFloatingWindowsHost(): void {
    const container = this.floatingWindowsHostRef.nativeElement;
    const target = document.fullscreenElement ?? this.hostRef.nativeElement;
    if (container.parentElement !== target) {
      target.appendChild(container);
    }
  }
  private readonly zone = inject(NgZone);
  private readonly iconosService = inject(IconosService);
  private readonly iconoSubscription = this.iconosService.iconoSeleccionado$.subscribe((icono) => {
    if (icono && this.iconosWindowOpen) {
      console.log('[MENU] icono recibido del catálogo:', icono);
      this.closeIconosWindow();
    }
  });

  @Output()
readonly poligonoCreado = new EventEmitter<FeaturePoligono>();

  @ViewChild('floatingWindow') private readonly floatingWindowRef?: ElementRef<HTMLElement>;
  @ViewChild('iconosWindow') private readonly iconosWindowRef?: ElementRef<HTMLElement>;
  @ViewChild(VentanaSistemasArtilleria) private sistemasWindow?: VentanaSistemasArtilleria;

  limitesWindowOpen = false;
  puntosWindowOpen = false;
  puntosWindowZIndex = 5400;
  @ViewChild(VentanaPuntos) private puntosWindow?: VentanaPuntos;

  /** Abre una sola instancia de PUNTOS o restaura la existente sin tocar otras ventanas. */
  openPuntosWindow(): void {
    this.syncFloatingWindowsHost();
    this.puntosWindowOpen = true;
    if (this.puntosWindow) {
      this.puntosWindow.restore();
      this.puntosWindow.focusWindow();
    } else this.activatePuntosWindow();
    this.changeDetector.markForCheck();
  }

  /** Comparte el orden de superposicion con todas las ventanas existentes. */
  activatePuntosWindow(): void {
    this.puntosWindowZIndex = Math.max(this.puntosWindowZIndex, this.limitesWindowZIndex,
      this.sistemasWindowZIndex, this.graficarWindowZIndex, this.iconosWindowZIndex) + 1;
  }
  limitesNuevaApertura = 0;
  limitesWindowZIndex = 5300;
  @ViewChild(VentanaLimitesSeguridad) private limitesWindow?: VentanaLimitesSeguridad;

  /** Ambos menus reutilizan esta unica instancia y restauran su estado si esta minimizada. */
  openLimitesWindow(): void {
    this.syncFloatingWindowsHost();
    if (!this.limitesWindowOpen) {
      this.limitesNuevaApertura++;
      this.capturaCoordenadasActivaChange.emit(false);
    }
    this.limitesWindowOpen = true;
    if (this.limitesWindow) {
      this.limitesWindow.restore();
      this.limitesWindow.focusWindow();
    } else this.activateLimitesWindow();
    this.changeDetector.markForCheck();
  }

  closeLimitesWindow(): void {
    this.limitesWindowOpen = false;
    this.capturaCoordenadasActivaChange.emit(false);
  }

  /** Comparte el orden visual del menu con Sistemas, Graficar e Iconos. */
  activateLimitesWindow(): void {
    this.limitesWindowZIndex = Math.max(this.puntosWindowZIndex, this.limitesWindowZIndex, this.sistemasWindowZIndex, this.graficarWindowZIndex, this.iconosWindowZIndex) + 1;
  }

  sistemasWindowOpen = false;
  sistemasWindowZIndex = 5200;

  /** Abre una sola instancia o restaura la existente sin perder su geometria. */
  openSistemasWindow(): void {
    this.syncFloatingWindowsHost();
    this.sistemasWindowOpen = true;
    if (this.sistemasWindow) this.sistemasWindow.restore();
    else this.activateSistemasWindow();
    this.changeDetector.markForCheck();
  }

  /** Eleva Sistemas sobre las ventanas del menu. */
  activateSistemasWindow(): void {
    this.sistemasWindowZIndex = Math.max(this.puntosWindowZIndex, this.limitesWindowZIndex, this.sistemasWindowZIndex, this.graficarWindowZIndex, this.iconosWindowZIndex) + 1;
  }

  /** Reutiliza la gestion de primer plano del menu para Graficar e Iconos. */
  activateExistingWindow(windowKey: FloatingWindowKey): void {
    this.bringWindowToFront(windowKey);
  }

  /**
   * Informa al componente padre qué vista principal
   * debe mostrarse.
   *
   * '2d' = Vulcano
   * '3d' = MapaTresD
   */
  @Output() vistaChange = new EventEmitter<VistaPrincipal>();
  @Output() coordenadaRegistrada = new EventEmitter<RegistroCoordenada>();

  @Input() vistaActiva: VistaPrincipal = '2d';

  // ======================================================
  // CONFIGURACION DE OPCIONES DEL MENU
  // ======================================================
  readonly menuItems: MenuOption[] = [
    { id: 1, name: 'Graficar', action: 'abrir_ventana_graficacion' },
    { id: 2, name: 'Sistemas', action: 'abrir-ventana-sistemas-artilleria' },//esta ventana permite caragr los sistemas asignados, trabajanos o misiosnes de fuegos realizadas y ver plan de fuegos
    { id: 4, name: '3D', action: 'cambiar_ventana' },
    { id: 5, name: '2D', action: 'cambiar_ventana' },
    { id: 6, name: 'HOJA MILIMITRADA', action: 'cambiar_ventana' },
  ];

  // ======================================================
  // VENTANA GRAFICAR
  // ======================================================
  graficarWindowOpen = false;
  graficarWindowX = 120;
  graficarWindowY = 120;
  graficarWindowWidth = 900;
  graficarWindowHeight = 600;
  iconosWindowOpen = false;
  iconosWindowX = 260;
  iconosWindowY = 180;
  iconosWindowWidth = 700;
  iconosWindowHeight = 540;
  readonly minWindowWidth = 420;
  readonly minWindowHeight = 300;
  readonly minIconosWindowWidth = 350;
  readonly minIconosWindowHeight = 300;
  graficarWindowZIndex = 5000;
  iconosWindowZIndex = 5100;

  private dragRafId = 0;
  private resizeRafId = 0;

  private dragState:
    | {
        windowKey: FloatingWindowKey;
        pointerId: number;
        startPointerX: number;
        startPointerY: number;
        baseWindowX: number;
        baseWindowY: number;
        pendingPointerX: number;
        pendingPointerY: number;
      }
    | null = null;

  private resizeState:
    | {
        windowKey: FloatingWindowKey;
        pointerId: number;
        startPointerX: number;
        startPointerY: number;
        baseWindowWidth: number;
        baseWindowHeight: number;
        pendingPointerX: number;
        pendingPointerY: number;
      }
    | null = null;

  private pointerCaptureTarget: HTMLElement | null = null;
  private readonly dragMoveHandler = (event: PointerEvent) => this.onDragMove(event);
  private readonly dragEndHandler = (event: PointerEvent) => this.onDragEnd(event);
  private readonly resizeMoveHandler = (event: PointerEvent) => this.onResizeMove(event);
  private readonly resizeEndHandler = (event: PointerEvent) => this.onResizeEnd(event);

  // ======================================================
  // ACCIONES
  // ======================================================

  /** Ejecuta las acciones del menu; el informe se solicita desde la Hoja Milimetrada. */
  onMenuClick(item: MenuOption): void {
    switch (item.action) {
      case 'abrir-ventana-sistemas-artilleria':
        this.openSistemasWindow();
        break;
      case 'abrir_ventana_graficacion':
        this.openGraficarWindow();
        break;
      case 'cambiar_ventana':
        if (item.id === 4) {
          this.cambiarVentana('3d');
        } else if (item.id === 5) {
          this.cambiarVentana('2d');
        } else if (item.id === 6) {
          this.cambiarVentana('hoja-milimetrada');
        }
        break;
      default:
        alert(item.name);
        break;
    }
  }

  // ======================================================
  // CAMBIO ENTRE VISTA 2D Y 3D
  // ======================================================

  cambiarVentana(vista: VistaPrincipal): void {
    this.vistaChange.emit(vista);
  }

  onCoordenadaRegistrada(registro: RegistroCoordenada): void {
    this.coordenadaRegistrada.emit(registro);
  }

  /** Abre la ventana unica y actualiza solo las coordenadas cuando procede del mapa. */
  openGraficarWindow(point?: GeographicPoint): void {
    if (point && validGeographicPoint(point)) this.coordenadasGraficar = { ...point };
    this.syncFloatingWindowsHost();
    this.changeDetector.markForCheck();
    if (this.graficarWindowOpen) {
      this.bringWindowToFront('graficar');
      return;
    }

    this.graficarWindowOpen = true;
    this.setInitialGraficarWindowGeometry();
    this.bringWindowToFront('graficar');
  }

  /** Conserva el cierre original y descarta la precarga para la siguiente apertura manual. */
  closeGraficarWindow(): void {
    this.graficarWindowOpen = false;
    this.coordenadasGraficar = null;
    this.stopPointerInteractions();
  }

  openIconosWindow(): void {
    if (this.iconosWindowOpen) {
      this.bringWindowToFront('iconos');
      return;
    }

    this.iconosWindowOpen = true;
    this.setInitialIconosWindowGeometry();
    this.bringWindowToFront('iconos');
  }

  closeIconosWindow(): void {
    this.iconosWindowOpen = false;
    this.stopPointerInteractions();
  }

  // ======================================================
  // DRAG
  // ======================================================

  startDrag(windowKey: FloatingWindowKey, event: PointerEvent): void {
    if (!this.isWindowOpen(windowKey)) {
      return;
    }

    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    this.stopPointerInteractions();

    const windowElement = this.getWindowElement(windowKey);
    if (!windowElement) {
      return;
    }

    this.zone.runOutsideAngular(() => {
      this.dragState = {
        windowKey,
        pointerId: event.pointerId,
        startPointerX: event.clientX,
        startPointerY: event.clientY,
        baseWindowX: this.getWindowX(windowKey),
        baseWindowY: this.getWindowY(windowKey),
        pendingPointerX: event.clientX,
        pendingPointerY: event.clientY,
      };

      this.pointerCaptureTarget = event.currentTarget as HTMLElement;
      this.pointerCaptureTarget?.setPointerCapture(event.pointerId);
      this.lockTextSelection(true);
      windowElement.style.willChange = 'transform';
      windowElement.style.transform = 'translate3d(0px, 0px, 0px)';

      window.addEventListener('pointermove', this.dragMoveHandler);
      window.addEventListener('pointerup', this.dragEndHandler);
      window.addEventListener('pointercancel', this.dragEndHandler);
    });
  }

  private onDragMove(event: PointerEvent): void {
    if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
      return;
    }

    this.dragState.pendingPointerX = event.clientX;
    this.dragState.pendingPointerY = event.clientY;

    if (!this.dragRafId) {
      this.dragRafId = window.requestAnimationFrame(() => this.flushDragFrame());
    }
  }

  private onDragEnd(event: PointerEvent): void {
    if (!this.dragState || event.pointerId !== this.dragState.pointerId) {
      return;
    }

    this.flushDragFrame(event.clientX, event.clientY);
    this.stopPointerInteractions();
  }

  // ======================================================
  // RESIZE
  // ======================================================

  startResize(windowKey: FloatingWindowKey, event: PointerEvent): void {
    if (!this.isWindowOpen(windowKey)) {
      return;
    }

    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    this.stopPointerInteractions();

    const windowElement = this.getWindowElement(windowKey);
    if (!windowElement) {
      return;
    }

    this.zone.runOutsideAngular(() => {
      this.resizeState = {
        windowKey,
        pointerId: event.pointerId,
        startPointerX: event.clientX,
        startPointerY: event.clientY,
        baseWindowWidth: this.getWindowWidth(windowKey),
        baseWindowHeight: this.getWindowHeight(windowKey),
        pendingPointerX: event.clientX,
        pendingPointerY: event.clientY,
      };

      this.pointerCaptureTarget = event.currentTarget as HTMLElement;
      this.pointerCaptureTarget?.setPointerCapture(event.pointerId);
      this.lockTextSelection(true);
      windowElement.style.willChange = 'width, height, transform';

      window.addEventListener('pointermove', this.resizeMoveHandler);
      window.addEventListener('pointerup', this.resizeEndHandler);
      window.addEventListener('pointercancel', this.resizeEndHandler);
    });
  }

  private onResizeMove(event: PointerEvent): void {
    if (!this.resizeState || event.pointerId !== this.resizeState.pointerId) {
      return;
    }

    this.resizeState.pendingPointerX = event.clientX;
    this.resizeState.pendingPointerY = event.clientY;

    if (!this.resizeRafId) {
      this.resizeRafId = window.requestAnimationFrame(() => this.flushResizeFrame());
    }
  }

  private onResizeEnd(event: PointerEvent): void {
    if (!this.resizeState || event.pointerId !== this.resizeState.pointerId) {
      return;
    }

    this.flushResizeFrame(event.clientX, event.clientY);
    this.stopPointerInteractions();
  }

  // ======================================================
  // UTILIDADES DE VENTANA
  // ======================================================

  private setInitialGraficarWindowGeometry(): void {
    this.setInitialWindowGeometry('graficar');
  }

  private setInitialIconosWindowGeometry(): void {
    const baseX = this.graficarWindowOpen ? this.graficarWindowX + 100 : 0;
    const baseY = this.graficarWindowOpen ? this.graficarWindowY + 70 : 0;
    this.setInitialWindowGeometry('iconos', baseX, baseY);
  }

  private stopPointerInteractions(): void {
    if (this.dragRafId) {
      window.cancelAnimationFrame(this.dragRafId);
      this.dragRafId = 0;
    }

    if (this.resizeRafId) {
      window.cancelAnimationFrame(this.resizeRafId);
      this.resizeRafId = 0;
    }

    window.removeEventListener('pointermove', this.dragMoveHandler);
    window.removeEventListener('pointerup', this.dragEndHandler);
    window.removeEventListener('pointercancel', this.dragEndHandler);
    window.removeEventListener('pointermove', this.resizeMoveHandler);
    window.removeEventListener('pointerup', this.resizeEndHandler);
    window.removeEventListener('pointercancel', this.resizeEndHandler);

    this.releasePointerCapture();
    this.lockTextSelection(false);
    this.resetWindowWillChange();
    this.dragState = null;
    this.resizeState = null;
  }

  private releasePointerCapture(): void {
    if (!this.pointerCaptureTarget || (this.dragState?.pointerId == null && this.resizeState?.pointerId == null)) {
      this.pointerCaptureTarget = null;
      return;
    }

    const pointerId = this.dragState?.pointerId ?? this.resizeState?.pointerId;

    if (pointerId != null && this.pointerCaptureTarget.hasPointerCapture(pointerId)) {
      try {
        this.pointerCaptureTarget.releasePointerCapture(pointerId);
      } catch {
        // Ignore release errors; the interaction already ended.
      }
    }

    this.pointerCaptureTarget = null;
  }

  private lockTextSelection(lock: boolean): void {
    document.body.style.userSelect = lock ? 'none' : '';
  }

  private resetWindowWillChange(): void {
    const graficarElement = this.floatingWindowRef?.nativeElement;
    const iconosElement = this.iconosWindowRef?.nativeElement;

    if (graficarElement) {
      graficarElement.style.willChange = '';
    }

    if (iconosElement) {
      iconosElement.style.willChange = '';
    }
  }

  private flushDragFrame(clientX?: number, clientY?: number): void {
    if (!this.dragState) {
      this.dragRafId = 0;
      return;
    }

    if (typeof clientX === 'number' && typeof clientY === 'number') {
      this.dragState.pendingPointerX = clientX;
      this.dragState.pendingPointerY = clientY;
    }

    const windowElement = this.getWindowElement(this.dragState.windowKey);
    if (!windowElement) {
      this.dragRafId = 0;
      return;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const currentWidth = this.getWindowWidth(this.dragState.windowKey);
    const currentHeight = this.getWindowHeight(this.dragState.windowKey);
    const maxX = Math.max(0, viewportWidth - currentWidth);
    const maxY = Math.max(0, viewportHeight - currentHeight);

    const deltaX = this.dragState.pendingPointerX - this.dragState.startPointerX;
    const deltaY = this.dragState.pendingPointerY - this.dragState.startPointerY;
    const nextX = this.clamp(this.dragState.baseWindowX + deltaX, 0, maxX);
    const nextY = this.clamp(this.dragState.baseWindowY + deltaY, 0, maxY);

    windowElement.style.transform = `translate3d(${nextX - this.dragState.baseWindowX}px, ${nextY - this.dragState.baseWindowY}px, 0)`;

    this.dragRafId = 0;

    if (typeof clientX === 'number' && typeof clientY === 'number') {
      const windowKey = this.dragState.windowKey;
      this.setWindowPosition(windowKey, nextX, nextY);
      windowElement.style.transform = 'translate3d(0px, 0px, 0px)';
      this.zone.run(() => this.updateWindowPosition(windowKey, nextX, nextY));
    }
  }

  private flushResizeFrame(clientX?: number, clientY?: number): void {
    if (!this.resizeState) {
      this.resizeRafId = 0;
      return;
    }

    if (typeof clientX === 'number' && typeof clientY === 'number') {
      this.resizeState.pendingPointerX = clientX;
      this.resizeState.pendingPointerY = clientY;
    }

    const windowElement = this.getWindowElement(this.resizeState.windowKey);
    if (!windowElement) {
      this.resizeRafId = 0;
      return;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const currentX = this.getWindowX(this.resizeState.windowKey);
    const currentY = this.getWindowY(this.resizeState.windowKey);
    const maxWidth = Math.max(0, viewportWidth - currentX);
    const maxHeight = Math.max(0, viewportHeight - currentY);

    const deltaX = this.resizeState.pendingPointerX - this.resizeState.startPointerX;
    const deltaY = this.resizeState.pendingPointerY - this.resizeState.startPointerY;
    const nextWidth = this.clampSize(
      this.resizeState.baseWindowWidth + deltaX,
      this.getMinWindowWidth(this.resizeState.windowKey),
      maxWidth,
    );
    const nextHeight = this.clampSize(
      this.resizeState.baseWindowHeight + deltaY,
      this.getMinWindowHeight(this.resizeState.windowKey),
      maxHeight,
    );

    this.setWindowSize(this.resizeState.windowKey, nextWidth, nextHeight);

    this.resizeRafId = 0;

    if (typeof clientX === 'number' && typeof clientY === 'number') {
      const windowKey = this.resizeState.windowKey;
      this.zone.run(() => this.updateWindowSize(windowKey, nextWidth, nextHeight));
    }
  }

  private clamp(value: number, min: number, max: number): number {
    if (Number.isNaN(value)) {
      return min;
    }

    return Math.min(Math.max(value, min), max);
  }

  private clampSize(value: number, min: number, max: number): number {
    if (max <= 0) {
      return max;
    }

    if (max < min) {
      return max;
    }

    return this.clamp(value, min, max);
  }

  private setInitialWindowGeometry(windowKey: FloatingWindowKey, baseX = 0, baseY = 0): void {
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const availableWidth = Math.max(0, viewportWidth - 16);
    const availableHeight = Math.max(0, viewportHeight - 16);

    const desktopWidth = windowKey === 'graficar'
      ? Math.min(900, Math.floor(viewportWidth * 0.9))
      : Math.min(700, Math.floor(viewportWidth * 0.9));
    const desktopHeight = windowKey === 'graficar'
      ? Math.min(600, Math.floor(viewportHeight * 0.8))
      : Math.min(560, Math.floor(viewportHeight * 0.8));

    const width = viewportWidth <= 480 ? availableWidth : desktopWidth;
    const height = viewportWidth <= 480 ? availableHeight : desktopHeight;
    const minWidth = this.getMinWindowWidth(windowKey);
    const minHeight = this.getMinWindowHeight(windowKey);

    const nextWidth = Math.max(0, Math.min(width, availableWidth || width));
    const nextHeight = Math.max(0, Math.min(height, availableHeight || height));

    const centeredX = Math.floor((viewportWidth - nextWidth) / 2);
    const centeredY = Math.floor((viewportHeight - nextHeight) / 2);

    const nextX = this.clamp(
      baseX || centeredX,
      8,
      Math.max(8, viewportWidth - nextWidth - 8),
    );
    const nextY = this.clamp(
      baseY || centeredY,
      8,
      Math.max(8, viewportHeight - nextHeight - 8),
    );

    const finalWidth = Math.max(minWidth, nextWidth);
    const finalHeight = Math.max(minHeight, nextHeight);

    this.updateWindowPosition(windowKey, nextX, nextY);
    this.updateWindowSize(windowKey, finalWidth, finalHeight);

    if (viewportWidth <= 480) {
      this.updateWindowPosition(windowKey, 8, 8);
      this.updateWindowSize(windowKey, Math.max(minWidth, viewportWidth - 16), Math.max(minHeight, viewportHeight - 16));
    }
  }

  private getWindowElement(windowKey: FloatingWindowKey): HTMLElement | null {
    return windowKey === 'graficar'
      ? this.floatingWindowRef?.nativeElement ?? null
      : this.iconosWindowRef?.nativeElement ?? null;
  }

  private getWindowX(windowKey: FloatingWindowKey): number {
    return windowKey === 'graficar' ? this.graficarWindowX : this.iconosWindowX;
  }

  private getWindowY(windowKey: FloatingWindowKey): number {
    return windowKey === 'graficar' ? this.graficarWindowY : this.iconosWindowY;
  }

  private getWindowWidth(windowKey: FloatingWindowKey): number {
    return windowKey === 'graficar' ? this.graficarWindowWidth : this.iconosWindowWidth;
  }

  private getWindowHeight(windowKey: FloatingWindowKey): number {
    return windowKey === 'graficar' ? this.graficarWindowHeight : this.iconosWindowHeight;
  }

  private getMinWindowWidth(windowKey: FloatingWindowKey): number {
    return windowKey === 'graficar' ? this.minWindowWidth : this.minIconosWindowWidth;
  }

  private getMinWindowHeight(windowKey: FloatingWindowKey): number {
    return windowKey === 'graficar' ? this.minWindowHeight : this.minIconosWindowHeight;
  }

  private updateWindowPosition(windowKey: FloatingWindowKey, x: number, y: number): void {
    if (windowKey === 'graficar') {
      this.graficarWindowX = x;
      this.graficarWindowY = y;
      return;
    }

    this.iconosWindowX = x;
    this.iconosWindowY = y;
  }

  private updateWindowSize(windowKey: FloatingWindowKey, width: number, height: number): void {
    if (windowKey === 'graficar') {
      this.graficarWindowWidth = width;
      this.graficarWindowHeight = height;
      return;
    }

    this.iconosWindowWidth = width;
    this.iconosWindowHeight = height;
  }

  private setWindowPosition(windowKey: FloatingWindowKey, x: number, y: number): void {
    const windowElement = this.getWindowElement(windowKey);
    if (windowElement) {
      windowElement.style.left = `${x}px`;
      windowElement.style.top = `${y}px`;
    }
  }

  private setWindowSize(windowKey: FloatingWindowKey, width: number, height: number): void {
    const windowElement = this.getWindowElement(windowKey);
    if (windowElement) {
      windowElement.style.width = `${width}px`;
      windowElement.style.height = `${height}px`;
    }
  }

  private isWindowOpen(windowKey: FloatingWindowKey): boolean {
    return windowKey === 'graficar' ? this.graficarWindowOpen : this.iconosWindowOpen;
  }

  private bringWindowToFront(windowKey: FloatingWindowKey): void {
    const z = Math.max(this.puntosWindowZIndex, this.limitesWindowZIndex, this.sistemasWindowZIndex, this.graficarWindowZIndex, this.iconosWindowZIndex) + 1;
    if (windowKey === 'graficar') this.graficarWindowZIndex = z;
    else this.iconosWindowZIndex = z;
  }

  @HostListener('window:resize')
  onWindowResize(): void {
    if (this.graficarWindowOpen) {
      this.setInitialGraficarWindowGeometry();
    }

    if (this.iconosWindowOpen) {
      this.setInitialIconosWindowGeometry();
    }
  }

  /** Restaura el contenedor trasladado antes de destruir el menu y libera sus recursos. */
  ngOnDestroy(): void {
    this.hostRef.nativeElement.appendChild(this.floatingWindowsHostRef.nativeElement);
    this.iconoSubscription.unsubscribe();
    this.stopPointerInteractions();
  }
  
}
