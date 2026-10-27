import { FloatingPanelDirective } from '../../../shared/components/window-workspace/floating-panel.directive';
import { WindowWorkspaceComponent } from '../../../shared/components/window-workspace/window-workspace.component';
import { WindowManagerService } from '../../../shared/components/window-workspace/window-manager.service';
import { GeographicPoint, validGeographicPoint } from '../../../shared/components/map-context-menu/map-actions.service';
import { MapActionPortalDirective } from '../../../shared/components/map-context-menu/map-action-portal.directive';
import { AfterViewInit, Component, computed, effect, ElementRef, EventEmitter, HostListener, Input, OnDestroy, Output, inject, signal, ViewChild, DestroyRef } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ElementoLocalDemo } from '../../../shared/models/elemento-local-demo.model';
import { RelacionFijada } from '../../../shared/models/relacion-fijada.model';
import { PerfilElevacionPoint, RegistroCoordenada, SimulacionTrayectoriaResponse, VulcanoApiService } from '../../../core/services/vulcano-api.service';
import { IconoSeleccionado, IconosService } from '../../../shared/services/iconos.service';
import { TIPOS_GRAFICACION } from '../../../shared/constants/tipos-graficacion';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  CurvasNivelService,
  CurvaNivelFeature
} from '../../../core/services/curvas-nivel.service';
import {
  Subscription,
  from,
  concatMap,
  finalize
} from 'rxjs';

interface LocalPoint { x: number; y: number; }
type DemoElement = ElementoLocalDemo & { readonly tipoGraficacion?: string };
type TipoPerfilVisual = 'trayectoria' | 'terreno' | 'combinado';

interface OrientacionPieza {
  conectado: boolean;
  tieneDatos: boolean;
  azimutGrados: number | null;
  azimutMils: number | null;
  elevacionGrados: number | null;
  elevacionMils: number | null;
  timestamp?: string;
}

interface ControlManualPieza {
  activo: boolean;
  direccionGrados: number;
  elevacionGrados: number;
}

type MovimientoManualPieza = 'direccion-izquierda' | 'direccion-derecha' | 'elevacion-arriba' | 'elevacion-abajo';
type ArrastreManualPieza = 'direccion' | 'elevacion';

@Component({
  selector: 'app-hoja-milimetrada',
  standalone: true,
  imports: [DecimalPipe, FormsModule, FloatingPanelDirective, WindowWorkspaceComponent, MapActionPortalDirective],
  // Cada Hoja administra solo la presentacion de sus ventanas; sus datos permanecen aqui.
  providers: [WindowManagerService],
  templateUrl: './hoja-milimetrada.component.html',
  styleUrls: ['./hoja-milimetrada.component.css', './proyectar.css'],
})
export class HojaMilimetradaComponent implements AfterViewInit, OnDestroy {
  private readonly iconosService = inject(IconosService);
  private readonly destroyRef = inject(DestroyRef);
  readonly iconosDisponibles = this.iconosService.catalogoIconos;
  readonly iconoProyeccion = signal<IconoSeleccionado | null>(null);
  readonly tiposGraficacion = TIPOS_GRAFICACION;
  private peticionCurvas?: Subscription;
  tipoGraficacionProyeccion = '';
  @ViewChild('localPlane') private plane!: ElementRef<SVGSVGElement>;
  @ViewChild('plotArea') private plotArea!: ElementRef<HTMLDivElement>;
  @ViewChild('terrainProfile') private terrainProfile?: ElementRef<HTMLDivElement>;

  @ViewChild('hojaCompleta')
private hojaCompleta!: ElementRef<HTMLElement>;

  private readonly registrosLocalesInternos = signal<readonly DemoElement[]>([]);
  private readonly rendered = computed<readonly DemoElement[]>(() => this.registrosLocalesInternos());
  get elements(): readonly DemoElement[] { return this.rendered(); }

  @Input()
  set registrosLocales(value: readonly unknown[] | null | undefined) {
    this.actualizarRegistros(value);
  }

  @Input()
  set registrosCoordenadas(value: readonly RegistroCoordenada[] | null | undefined) {
    this.actualizarRegistros(value);
  }
  @Input()
  set relacionFijadaEntrada(value: RelacionFijada | null | undefined) {
    this.relacion.set(value ?? null);
  }
  private readonly simulacionActual = signal<SimulacionTrayectoriaResponse | null>(null);
  @Input()
  set simulacionTrayectoria(value: SimulacionTrayectoriaResponse | null) {
    this.simulacionActual.set(value);
    if (value) this.ajustarTodo();
  }
  get simulacionTrayectoria(): SimulacionTrayectoriaResponse | null { return this.simulacionActual(); }
  @Input() calculandoTrayectoria = false;
  @Output() relacionFijada = new EventEmitter<RelacionFijada | null>();
  @Output() coordenadaRegistrada = new EventEmitter<RegistroCoordenada>();
  @Output() abrirCatalogoIconos = new EventEmitter<void>();
  @Output() abrirGraficar = new EventEmitter<void>();
  /** Solicita la unica ventana compartida sin modificar la pieza ni sus coordenadas. */
  @Output() abrirLimitesSeguridad = new EventEmitter<void>();

  /** Cierra el menu de pieza y delega exclusivamente la apertura al contenedor Vulcano. */
  solicitarLimitesSeguridad(): void {
    this.contextId.set(null);
    this.abrirLimitesSeguridad.emit();
  }
  /** Solicita al padre el informe existente sin duplicar su logica de generacion. */
  @Output() informeSolicitado = new EventEmitter<void>();
  /** Refleja la operacion del padre para bloquear clics mientras se genera el PDF. */
  @Input() generandoInforme = false;
  distanciaProyeccion = '';
  azimutProyeccion: number | null = null;
  nombreProyeccion = '';
  proyectando = false;
  orientacionPieza: OrientacionPieza = {
    conectado: false,
    tieneDatos: false,
    azimutGrados: null,
    azimutMils: null,
    elevacionGrados: null,
    elevacionMils: null,
  };
  controlManualPieza: ControlManualPieza = {
    activo: false,
    direccionGrados: 0,
    elevacionGrados: 0,
  };
  readonly PASO_DIRECCION = 1;
  readonly PASO_ELEVACION = 1;
  readonly ELEVACION_MINIMA = -5;
  readonly ELEVACION_MAXIMA = 66;
  readonly marcasPieza = Array.from({ length: 32 }, (_, i) => i * 11.25).filter(angulo => angulo % 45 !== 0);
  readonly modalProyectarPosicion = signal({ x: 0, y: 0 });
  readonly arrastrandoProyectar = signal(false);
  readonly marcasProyeccion = Array.from({ length: 72 }, (_, i) => i * 5);
  readonly coordenadasOrigen = computed(() => {
    const origen = this.elementoProyectar();
    return [
      { label: 'LATITUD', valor: origen?.latitud, latitud: true },
      { label: 'LONGITUD', valor: origen?.longitud, latitud: false },
    ].map(({ label, valor, latitud }) => {
      if (valor == null || !Number.isFinite(valor)) return { label, hemisferio: '--', grados: '--', minutos: '--', segundos: '--', decimal: '--' };
      // Solo presentación: no vuelve a convertir ni modifica el punto original.
      const total = Math.round(Math.abs(valor) * 3600 * 1000);
      return {
        label, hemisferio: latitud ? (valor < 0 ? 'S' : 'N') : (valor < 0 ? 'W' : 'E'),
        grados: String(Math.floor(total / 3600000)), minutos: String(Math.floor(total / 60000) % 60),
        segundos: ((total % 60000) / 1000).toFixed(3), decimal: valor.toFixed(6)
      };
    });
  });
  private modalDrag: { pointerId: number; startX: number; startY: number; originX: number; originY: number } | null = null;
  readonly minZoom = 0.005;
  readonly maxZoom = 8;

/**
 * Vista geográfica inicial de VULCANO.
 *
 * Centro: Bogotá, Colombia.
 * Sistema de coordenadas: EPSG:9377.
 *
 * Coordenadas obtenidas mediante la conversión
 * geográfica que ya fue comprobada.
 */
readonly zoom = signal(0.05);

readonly viewport = signal({
  width: 880,
  height: 440
});

readonly center = signal<LocalPoint>({
  x: 4880248.454141552,
  y: 2066385.7614871317
});

  readonly pointer = signal<LocalPoint | null>(null);
  readonly dragging = signal(false);
  private readonly contextId = signal<string | null>(null);
  private readonly informationId = signal<string | null>(null);
  private readonly selectionId = signal<string | null>(null);
  private readonly proyectarId = signal<string | null>(null);
  private readonly origenPendienteId = signal<string | null>(null);
  readonly relacion = signal<RelacionFijada | null>(null);
  readonly contextElement = computed(() => this.elements.find(item => item.id === this.contextId()) ?? null);
  readonly information = computed(() => this.elements.find(item => item.id === this.informationId()) ?? null);
  readonly selectedId = computed(() => this.elements.find(item => item.id === this.selectionId())?.id ?? null);
  private readonly origenMapaProyeccion = signal<GeographicPoint | null>(null);
  readonly proyeccionMapaHost = signal<HTMLElement | null>(null);
  // El origen temporal no se agrega a los registros ni crea un marcador persistido.
  readonly elementoProyectar = computed(() => {
    const point = this.origenMapaProyeccion();
    return point ? { name: 'PUNTO DEL MAPA', tipoGraficacion: '', ...point }
      : this.elements.find(item => item.id === this.proyectarId()) ?? null;
  });
  readonly origenPendiente = computed(() => this.elements.find(item => item.id === this.origenPendienteId()) ?? null);
  readonly lineaFijada = computed(() => {
    const relacion = this.relacion();
    return relacion ? { origen: this.toScreen(relacion.origen), destino: this.toScreen(relacion.destino) } : null;
  });
  readonly elementosPantalla = computed(() => {
    const viewport = this.viewport();
    const center = this.center();
    const scale = this.scale();
    return this.registrosLocalesInternos().map(element => ({
      ...element,
      screenX: viewport.width / 2 + (element.x - center.x) * scale,
      screenY: viewport.height / 2 - (element.y - center.y) * scale,
    }));
  });
  readonly etiquetaRelacion = computed(() => {
    const linea = this.lineaFijada();
    const relacion = this.relacion();
    return linea && relacion ? { x: (linea.origen.x + linea.destino.x) / 2, y: (linea.origen.y + linea.destino.y) / 2, texto: this.formatearDistancia(relacion.distanciaMetros) } : null;
  });
  readonly tieneRelacion = computed(() => this.relacion() !== null);
  readonly azimut = computed(() => this.relacion()?.azimutGrados ?? 0);
  readonly distanciaRelacion = computed(() => this.relacion()?.distanciaMetros ?? null);
  readonly tipoPerfilVisual = signal<TipoPerfilVisual>('combinado');
  readonly perfilHover = signal<PerfilElevacionPoint | null>(null);
  readonly zoomPerfil = signal(1);
  readonly panPerfil = signal({ x: 0, y: 0 });
  public perfilPan: { pointerId: number; x: number; y: number; panX: number; panY: number } | null = null;
  readonly scale = computed(() => Math.min(this.viewport().width / 420, this.viewport().height / 260) * this.zoom());
  readonly zoomPercent = computed(() => Math.round(this.zoom() * 100));
  readonly origin = computed(() => this.toScreen({ x: 0, y: 0 }));
  readonly cursor = computed(() => {
    const point = this.pointer();
    return point ? this.toLocal(point) : null;
  });
  readonly cursorGeografico = computed(() => {
    const point = this.cursor();
    return point ? this.convertirOrigenNacionalAWgs84(point) : null;
  });
  readonly referenciasLongitud = computed(() => this.referenciasGeograficas('x'));
  readonly referenciasLatitud = computed(() => this.referenciasGeograficas('y'));
  readonly cursorTooltip = computed(() => {
    const point = this.pointer();
    const { width, height } = this.viewport();
    return point ? {
      x: this.clamp(point.x + 184 < width ? point.x + 16 : point.x - 184, 4, Math.max(4, width - 172)),
      y: this.clamp(point.y + 160 < height ? point.y + 16 : point.y - 160, 4, Math.max(4, height - 148)),
    } : null;
  });
  readonly minorStep = computed(() => this.niceStep(12 / this.scale()));
  readonly verticalLines = computed(() => this.gridLines('x'));
  readonly horizontalLines = computed(() => this.gridLines('y'));
  readonly xLabelY = computed(() => this.clamp(this.origin().y + 17, 17, this.viewport().height - 7));
  readonly yLabelX = computed(() => this.clamp(this.origin().x - 8, 40, this.viewport().width - 24));
  readonly scaleBar = computed(() => {
    const units = this.niceStep(60 / this.scale());
    return { units, pixels: units * this.scale() };
  });
  readonly menuPosition = computed(() => {
    const element = this.contextElement();
    const point = element ? this.toScreen(element) : { x: 0, y: 0 };
    return {
      x: this.clamp(point.x + 12, 6, this.viewport().width - 186),
      y: this.clamp(point.y + 12, 6, this.viewport().height - 210),
    };
  });

  perfilMuestras(): PerfilElevacionPoint[] {
    return this.perfilMuestrasCalculadas();
  }

  readonly perfilMuestrasCalculadas = computed(() =>
    (this.simulacionActual()?.perfil_elevacion ?? []).filter(item => Number.isFinite(item.distancia_m) && Number.isFinite(item.terreno_msnm)));

  private calcularPerfilEscala(): { min: number; max: number; total: number } {
    const muestras = this.perfilMuestras();
    const resumen = this.simulacionTrayectoria?.resumen_perfil;
    const values = muestras.map(item => item.terreno_msnm);
    const terrenoMin = Number.isFinite(resumen?.elevacion_minima_msnm)
      ? resumen!.elevacion_minima_msnm : (values.length ? Math.min(...values) : 0);
    const terrenoMax = Number.isFinite(resumen?.elevacion_maxima_msnm)
      ? resumen!.elevacion_maxima_msnm : (values.length ? Math.max(...values) : 1);
    const simulacion = this.simulacionTrayectoria;
    const trayectoria = simulacion ? Array.from({ length: 121 }, (_, i) => this.trayectoriaAltura((simulacion.distancia_m * i) / 120)) : [];
    let minValue = terrenoMin;
    let maxValue = terrenoMax;
    if (this.tipoPerfilVisual() !== 'terreno' && trayectoria.length) {
      minValue = Math.min(minValue, ...trayectoria, simulacion!.p1.elevacion_msnm, simulacion!.p2.elevacion_msnm);
      maxValue = Math.max(maxValue, ...trayectoria, simulacion!.apogeo.altitud_visual_msnm);
    }
    const span = Math.max(maxValue - minValue, 1);
    const padding = Math.max(span * 0.1, 1);
    return { min: minValue - padding, max: maxValue + padding, total: Math.max(muestras.at(-1)?.distancia_m ?? 0, 1) };
  }

  readonly perfilEscalaCalculada = computed(() => this.calcularPerfilEscala());
  perfilEscala(): { min: number; max: number; total: number } { return this.perfilEscalaCalculada(); }

  private calcularPerfilPuntos(): string {
    const muestras = this.perfilMuestras();
    const escala = this.perfilEscala();
    return muestras.map(item => `${this.perfilX(item, escala)},${this.perfilY(item, escala)}`).join(' ');
  }

  readonly perfilPuntosCalculados = computed(() => this.calcularPerfilPuntos());
  perfilPuntos(): string { return this.perfilPuntosCalculados(); }

  perfilArea(): string {
    const puntos = this.perfilPuntosCalculados();
    return puntos ? `40,195 ${puntos} 840,195` : '';
  }

  perfilX(item: PerfilElevacionPoint, escala = this.perfilEscala()): number {
    return this.transformarX(40 + (Math.max(0, item.distancia_m) / escala.total) * 800);
  }

  perfilY(item: PerfilElevacionPoint, escala = this.perfilEscala()): number {
    return this.transformarY(195 - ((item.terreno_msnm - escala.min) / Math.max(escala.max - escala.min, 1)) * 160);
  }

  private transformarX(x: number): number { const z = this.zoomPerfil(); return 440 + (x - 440) * z + this.panPerfil().x; }
  private transformarY(y: number): number { const z = this.zoomPerfil(); return 112.5 + (y - 112.5) * z + this.panPerfil().y; }

  apogeoDistancia(): number {
    const simulacion = this.simulacionTrayectoria;
    if (!simulacion) return 0;
    const apogeo = simulacion.apogeo as typeof simulacion.apogeo & { distancia_m?: number };
    return Number.isFinite(apogeo.distancia_m) ? apogeo.distancia_m! : simulacion.distancia_m / 2;
  }

  private calcularTrayectoriaPuntos(): string {
    const simulacion = this.simulacionTrayectoria;
    if (!simulacion) return '';
    const escala = this.perfilEscala();
    const total = simulacion.distancia_m;
    const apex = this.apogeoDistancia();
    return Array.from({ length: 121 }, (_, index) => {
      const x = total * index / 120;
      const t = apex > 0 && x <= apex ? x / apex : (total - x) / Math.max(total - apex, 1);
      const y = x <= apex
        ? simulacion.p1.elevacion_msnm + (simulacion.apogeo.altitud_visual_msnm - simulacion.p1.elevacion_msnm) * (1 - (1 - t) ** 2)
        : simulacion.p2.elevacion_msnm + (simulacion.apogeo.altitud_visual_msnm - simulacion.p2.elevacion_msnm) * (1 - (1 - t) ** 2);
      return `${this.transformarX(40 + (x / Math.max(total, 1)) * 800)},${this.transformarY(195 - ((y - escala.min) / Math.max(escala.max - escala.min, 1)) * 160)}`;
    }).join(' ');
  }

  readonly trayectoriaPuntosCalculados = computed(() => this.calcularTrayectoriaPuntos());
  trayectoriaPuntos(): string { return this.trayectoriaPuntosCalculados(); }

  trayectoriaApogeo(): LocalPoint {
    const simulacion = this.simulacionTrayectoria!;
    const escala = this.perfilEscala();
    return { x: this.transformarX(40 + (this.apogeoDistancia() / Math.max(simulacion.distancia_m, 1)) * 800), y: this.transformarY(195 - ((simulacion.apogeo.altitud_visual_msnm - escala.min) / Math.max(escala.max - escala.min, 1)) * 160) };
  }

  trayectoriaAltura(distancia: number): number {
    const simulacion = this.simulacionTrayectoria!;
    const apex = this.apogeoDistancia();
    const t = distancia <= apex ? distancia / Math.max(apex, 1) : (simulacion.distancia_m - distancia) / Math.max(simulacion.distancia_m - apex, 1);
    return (distancia <= apex ? simulacion.p1.elevacion_msnm : simulacion.p2.elevacion_msnm) + (simulacion.apogeo.altitud_visual_msnm - (distancia <= apex ? simulacion.p1.elevacion_msnm : simulacion.p2.elevacion_msnm)) * (1 - (1 - t) ** 2);
  }

  onPerfilPointerMove(event: MouseEvent): void {
    const muestras = this.perfilMuestras();
    if (!muestras.length) return;
    const rect = (event.currentTarget as SVGElement).getBoundingClientRect();
    const distance = this.clamp(((event.clientX - rect.left) / Math.max(rect.width, 1)) * this.perfilEscala().total, 0, this.perfilEscala().total);
    this.perfilHover.set(muestras.reduce((nearest, item) => Math.abs(item.distancia_m - distance) < Math.abs(nearest.distancia_m - distance) ? item : nearest));
  }

  seleccionarPerfil(tipo: TipoPerfilVisual): void {
    this.tipoPerfilVisual.set(tipo);
    this.ajustarTodo();
    this.perfilHover.set(null);
  }

  private observer?: ResizeObserver;
  private focusFrame = 0;
  private pointerFrame = 0;
  private pendingPointer: LocalPoint | null = null;
  private drag: { id: number; start: LocalPoint; center: LocalPoint } | null = null;
  private movimientoManualTimer: ReturnType<typeof window.setInterval> | null = null;
  arrastreManualPieza: { tipo: ArrastreManualPieza; pointerId: number; target: SVGSVGElement } | null = null;
  private readonly wheelListener = (event: WheelEvent) => this.onWheel(event);

  constructor(private readonly vulcanoApi: VulcanoApiService) {
    this.iconosService.iconoSeleccionado$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((icono) => {
        this.iconoProyeccion.set(icono);
        if (icono) console.log('[PROYECTAR] icono recibido:', icono);
        console.log('[PROYECTAR ICONO] estado actualizado:', icono?.nombre ?? null);
      });
    // Keep only IDs locally so open cards follow changes; missing items leave no stale selection.
    effect(() => {
      const ids = new Set(this.elements.map(item => item.id));
      for (const state of [this.contextId, this.informationId, this.selectionId]) {
        const id = state();
        if (id !== null && !ids.has(id)) state.set(null);
      }
    });
    
/**
 * Observa los cambios de cámara de la Hoja Milimetrada.
 *
 * Cuando el modo automático está habilitado,
 * espera 600 ms antes de consultar.
 *
 * Si el usuario continúa moviéndose, reinicia
 * la espera para evitar consultas excesivas.
 */
effect((onCleanup) => {
  const automatico = this.curvasAutomaticas();

  // Dependencias reactivas de la cámara.
  const centro = this.center();
  const zoomActual = this.zoom();
  const dimensiones = this.viewport();

  if (!automatico) {
    return;
  }

  if (
    !Number.isFinite(centro.x) ||
    !Number.isFinite(centro.y) ||
    zoomActual <= 0 ||
    dimensiones.width <= 0 ||
    dimensiones.height <= 0
  ) {
    return;
  }

  const temporizador = window.setTimeout(() => {
    this.cargarCurvasNivel();
  }, 600);

  onCleanup(() => {
    window.clearTimeout(temporizador);
  });
});

  }

  ngAfterViewInit(): void {
    // Nonvisual renderers (including jsdom) may not provide ResizeObserver.
    if (typeof ResizeObserver !== 'undefined') {
      this.observer = new ResizeObserver(([entry]) => {
        const { width, height } = entry.contentRect;
        // The parent keeps views mounted while hidden; preserve the camera at 0 × 0.
        if (width > 0 && height > 0) {
          this.viewport.set({ width, height });
          this.pointer.set(null);
        }
      });
      this.observer.observe(this.plane.nativeElement);
    }
    this.plane.nativeElement.addEventListener('wheel', this.wheelListener, { passive: false });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    cancelAnimationFrame(this.focusFrame);
    cancelAnimationFrame(this.pointerFrame);
    this.detenerMovimientoContinuo();
    this.finalizarArrastreControlManualPieza();
    this.plane.nativeElement.removeEventListener('wheel', this.wheelListener);
    this.peticionCurvas?.unsubscribe();
  }

  toScreen(point: LocalPoint): LocalPoint {
    return {
      x: this.viewport().width / 2 + (point.x - this.center().x) * this.scale(),
      y: this.viewport().height / 2 - (point.y - this.center().y) * this.scale(),
    };
  }

  private toLocal(point: LocalPoint): LocalPoint {
    return {
      x: this.center().x + (point.x - this.viewport().width / 2) / this.scale(),
      y: this.center().y - (point.y - this.viewport().height / 2) / this.scale(),
    };
  }

  format(value: number): string {
    return (Math.abs(value) < 0.005 ? 0 : value).toFixed(2);
  }

  actualizarOrientacionPieza(data: any): void {
    if (!data || typeof data !== 'object' || data.conectado !== true) {
      this.orientacionPieza = {
        ...this.orientacionPieza,
        conectado: false,
        tieneDatos: false,
        azimutGrados: null,
        azimutMils: null,
        elevacionGrados: null,
        elevacionMils: null,
        timestamp: undefined,
      };
      return;
    }

    const azimutGrados = this.normalizarNumero(data.azimutGrados);
    const azimutMils = this.normalizarNumero(data.azimutMils);
    const elevacionGrados = this.normalizarNumero(data.elevacionGrados);
    const elevacionMils = this.normalizarNumero(data.elevacionMils);
    const timestamp = typeof data.timestamp === 'string' && data.timestamp.trim()
      ? data.timestamp
      : undefined;

    this.orientacionPieza = {
      conectado: data.conectado === true,
      tieneDatos: data.tieneDatos !== false && [azimutGrados, azimutMils, elevacionGrados, elevacionMils].some(value => value !== null),
      azimutGrados,
      azimutMils,
      elevacionGrados,
      elevacionMils,
      timestamp,
    };
  }

  direccionRealGrados(): number | null {
    return this.orientacionPieza.tieneDatos ? this.orientacionPieza.azimutGrados : null;
  }

  direccionRealMils(): number | null {
    return this.orientacionPieza.tieneDatos ? this.orientacionPieza.azimutMils : null;
  }

  elevacionRealGrados(): number | null {
    return this.orientacionPieza.tieneDatos ? this.orientacionPieza.elevacionGrados : null;
  }

  elevacionRealMils(): number | null {
    return this.orientacionPieza.tieneDatos ? this.orientacionPieza.elevacionMils : null;
  }

  direccionVisualPiezaGrados(): number | null {
    if (this.controlManualPieza.activo) return this.controlManualPieza.direccionGrados;
    return this.direccionRealGrados();
  }

  direccionVisualPiezaMils(): number | null {
    if (this.controlManualPieza.activo) return this.convertirGradosAMils(this.controlManualPieza.direccionGrados);
    return this.direccionRealMils();
  }

  elevacionVisualPiezaGrados(): number | null {
    if (this.controlManualPieza.activo) return this.controlManualPieza.elevacionGrados;
    return this.elevacionRealGrados();
  }

  elevacionVisualPiezaMils(): number | null {
    if (this.controlManualPieza.activo) return this.convertirGradosAMils(this.controlManualPieza.elevacionGrados);
    return this.elevacionRealMils();
  }

  etiquetaDireccionPieza(): string {
    return this.controlManualPieza.activo ? 'DIRECCIÓN MANUAL' : 'DIRECCIÓN REAL';
  }

  etiquetaElevacionPieza(): string {
    return this.controlManualPieza.activo ? 'ELEVACIÓN MANUAL' : 'ELEVACIÓN REAL';
  }

  rotacionDireccion(grados: number | null): number {
    return grados ?? 0;
  }

  sectorElevacionPieza(): string | null {
    const grados = this.elevacionVisualPiezaGrados();
    if (grados === null || grados === 0) return null;
    const angulo = this.limitarElevacion(grados) * Math.PI / 180;
    const x = 110 + 66 * Math.cos(angulo);
    const y = 122 - 66 * Math.sin(angulo);
    return `M110 122 L176 122 A66 66 0 0 ${grados > 0 ? 0 : 1} ${x} ${y} Z`;
  }

  rotacionElevacionPieza(grados: number | null): number {
    return grados === null ? 0 : -this.limitarElevacion(grados);
  }

  activarDesactivarControlManual(): void {
    this.controlManualPieza = {
      ...this.controlManualPieza,
      activo: !this.controlManualPieza.activo,
      direccionGrados: this.normalizarDireccion(this.controlManualPieza.direccionGrados),
      elevacionGrados: this.limitarElevacion(this.controlManualPieza.elevacionGrados),
    };
    this.detenerMovimientoContinuo();
    if (!this.controlManualPieza.activo) this.finalizarArrastreControlManualPieza();
  }

  moverDireccion(delta: number): void {
    if (!this.controlManualPieza.activo || !Number.isFinite(delta)) return;
    this.controlManualPieza = {
      ...this.controlManualPieza,
      direccionGrados: this.normalizarDireccion(this.controlManualPieza.direccionGrados + delta),
    };
  }

  moverElevacion(delta: number): void {
    if (!this.controlManualPieza.activo || !Number.isFinite(delta)) return;
    this.controlManualPieza = {
      ...this.controlManualPieza,
      elevacionGrados: this.limitarElevacion(this.controlManualPieza.elevacionGrados + delta),
    };
  }

  normalizarDireccion(grados: number): number {
    if (!Number.isFinite(grados)) return 0;
    return ((grados % 360) + 360) % 360;
  }

  valorCampoManualPieza(tipo: ArrastreManualPieza): number {
    const valor = tipo === 'direccion' ? this.controlManualPieza.direccionGrados : this.controlManualPieza.elevacionGrados;
    const redondeado = Number(valor.toFixed(2));
    return tipo === 'direccion' ? Math.min(359.99, redondeado) : redondeado;
  }

  actualizarCampoManualPieza(tipo: ArrastreManualPieza, valor: number | null): void {
    if (!this.controlManualPieza.activo || valor === null || !Number.isFinite(valor)) return;
    if (tipo === 'direccion') {
      if (valor < 0 || valor >= 360) return;
      this.controlManualPieza = { ...this.controlManualPieza, direccionGrados: valor };
      return;
    }
    if (valor < this.ELEVACION_MINIMA || valor > this.ELEVACION_MAXIMA) return;
    this.controlManualPieza = { ...this.controlManualPieza, elevacionGrados: valor };
  }

  limitarElevacion(grados: number): number {
    return Number.isFinite(grados) ? Math.max(this.ELEVACION_MINIMA, Math.min(this.ELEVACION_MAXIMA, grados)) : 0;
  }

  iniciarMovimientoContinuo(tipo: MovimientoManualPieza, event: PointerEvent): void {
    if (!this.controlManualPieza.activo || event.button !== 0) return;
    event.preventDefault();
    this.aplicarMovimientoManual(tipo);
    this.detenerMovimientoContinuo();
    this.movimientoManualTimer = window.setInterval(() => this.aplicarMovimientoManual(tipo), 90);
  }

  detenerMovimientoContinuo(): void {
    if (this.movimientoManualTimer !== null) {
      window.clearInterval(this.movimientoManualTimer);
      this.movimientoManualTimer = null;
    }
  }

  iniciarArrastreDireccion(event: PointerEvent): void {
    this.iniciarArrastreControlManualPieza('direccion', event);
  }

  iniciarArrastreElevacion(event: PointerEvent): void {
    this.iniciarArrastreControlManualPieza('elevacion', event);
  }

  private aplicarMovimientoManual(tipo: MovimientoManualPieza): void {
    switch (tipo) {
      case 'direccion-izquierda':
        this.moverDireccion(-this.PASO_DIRECCION);
        break;
      case 'direccion-derecha':
        this.moverDireccion(this.PASO_DIRECCION);
        break;
      case 'elevacion-arriba':
        this.moverElevacion(this.PASO_ELEVACION);
        break;
      case 'elevacion-abajo':
        this.moverElevacion(-this.PASO_ELEVACION);
        break;
    }
  }

  private iniciarArrastreControlManualPieza(tipo: ArrastreManualPieza, event: PointerEvent): void {
    if (!this.controlManualPieza.activo || event.button !== 0) return;
    const target = event.currentTarget;
    if (!(target instanceof SVGSVGElement)) return;
    event.preventDefault();
    this.finalizarArrastreControlManualPieza();
    this.arrastreManualPieza = { tipo, pointerId: event.pointerId, target };
    target.setPointerCapture(event.pointerId);
    this.actualizarArrastreManualPieza(event);
  }

  arrastrarControlManualPieza(event: PointerEvent): void {
    if (!this.arrastreManualPieza || event.pointerId !== this.arrastreManualPieza.pointerId) return;
    this.actualizarArrastreManualPieza(event);
  }

  finalizarArrastreControlManualPieza(event?: PointerEvent): void {
    if (!this.arrastreManualPieza) return;
    if (event && event.pointerId !== this.arrastreManualPieza.pointerId) return;
    const { target, pointerId } = this.arrastreManualPieza;
    if (target.hasPointerCapture(pointerId)) {
      try { target.releasePointerCapture(pointerId); } catch { /* Pointer capture may already be gone. */ }
    }
    this.arrastreManualPieza = null;
  }

  private actualizarArrastreManualPieza(event: PointerEvent): void {
    if (!this.arrastreManualPieza) return;
    const { tipo, target } = this.arrastreManualPieza;
    const matriz = target.getScreenCTM();
    if (!matriz) return;
    const punto = new DOMPoint(event.clientX, event.clientY).matrixTransform(matriz.inverse());
    const dx = punto.x - 110;
    const dy = punto.y - (tipo === 'direccion' ? 110 : 122);
    if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) return;
    const grados = Math.atan2(dx, -dy) * 180 / Math.PI;
    if (this.arrastreManualPieza.tipo === 'direccion') {
      this.controlManualPieza = { ...this.controlManualPieza, direccionGrados: this.normalizarDireccion(grados) };
      return;
    }
    const elevacion = Math.atan2(-dy, dx) * 180 / Math.PI;
    this.controlManualPieza = { ...this.controlManualPieza, elevacionGrados: this.limitarElevacion(elevacion) };
  }

  formatGrados(value: number | null): string {
    return value === null ? '--°' : `${this.format(value)}°`;
  }

  formatMils(value: number | null): string {
    return value === null ? '-- mils' : `${value.toFixed(0)} mils`;
  }

  formatMilsGrados(mils: number | null, grados: number | null): string {
    return `${this.formatMils(mils)} / ${this.formatGrados(grados)}`;
  }

  private convertirGradosAMils(grados: number): number {
    return Number.isFinite(grados) ? grados * 6400 / 360 : 0;
  }

  private normalizarNumero(value: unknown): number | null {
    if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) {
      return null;
    }

    const numero = Number(value);
    return Number.isFinite(numero) ? numero : null;
  }

  private niceStep(value: number): number {
    const power = 10 ** Math.floor(Math.log10(value));
    const fraction = value / power;
    return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
  }

  private gridLines(axis: 'x' | 'y'): { value: number; pixel: number; major: boolean }[] {
    const step = this.minorStep();
    const half = (axis === 'x' ? this.viewport().width : this.viewport().height) / (2 * this.scale());
    const middle = this.center()[axis];
    const first = Math.ceil((middle - half) / step);
    const last = Math.floor((middle + half) / step);
    return Array.from({ length: Math.max(0, last - first + 1) }, (_, offset) => {
      const index = first + offset;
      const value = Number((index * step).toPrecision(12));
      const point = this.toScreen(axis === 'x' ? { x: value, y: 0 } : { x: 0, y: value });
      return { value, pixel: point[axis], major: index % 5 === 0 };
    });
  }

  private eventPoint(event: MouseEvent): LocalPoint {
    const rect = this.plane.nativeElement.getBoundingClientRect();
    return {
      x: (event.clientX - rect.left) * this.viewport().width / rect.width,
      y: (event.clientY - rect.top) * this.viewport().height / rect.height,
    };
  }

  private onWheel(event: WheelEvent): void {
    event.preventDefault();
    if (this.drag) return;
    const point = this.eventPoint(event);
    this.pointer.set(point);
    const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.viewport().height : 1);
    this.zoomAt(this.zoom() * Math.exp(-this.clamp(delta, -300, 300) * 0.002), point);
  }

  zoomBy(factor: number): void {
    this.zoomAt(this.zoom() * factor, { x: this.viewport().width / 2, y: this.viewport().height / 2 });
  }

  private zoomAt(value: number, point: LocalPoint): void {
    const fixed = this.toLocal(point);
    this.zoom.set(this.clamp(value, this.minZoom, this.maxZoom));
    const after = this.toLocal(point);
    this.center.update(center => ({ x: center.x + fixed.x - after.x, y: center.y + fixed.y - after.y }));
    this.contextId.set(null);
  }

 
/**
 * Restablece la vista geográfica inicial.
 *
 * Conserva las operaciones de limpieza
 * del método original.
 */
resetView(): void {

  this.zoom.set(0.05);

  this.center.set({
    x: 4880248.454141552,
    y: 2066385.7614871317
  });

  this.pointer.set(null);
  this.contextId.set(null);
  this.informationId.set(null);

  this.endDrag();
}


  onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || !event.isPrimary || this.drag) return;
    event.preventDefault();
    this.drag = { id: event.pointerId, start: this.eventPoint(event), center: this.center() };
    this.dragging.set(true);
    this.plane.nativeElement.setPointerCapture(event.pointerId);
  }

  onPointerMove(event: PointerEvent): void {
    if (this.drag && this.drag.id !== event.pointerId) return;
    const point = this.eventPoint(event);
    if (this.drag) {
      this.center.set({
        x: this.drag.center.x - (point.x - this.drag.start.x) / this.scale(),
        y: this.drag.center.y + (point.y - this.drag.start.y) / this.scale(),
      });
    }
    this.pendingPointer = point;
    if (!this.pointerFrame) {
      this.pointerFrame = requestAnimationFrame(() => {
        this.pointerFrame = 0;
        this.pointer.set(this.pendingPointer);
      });
    }
  }

  endDrag(event?: PointerEvent): void {
    if (!this.drag || (event && event.pointerId !== this.drag.id)) return;
    const id = this.drag.id;
    this.drag = null;
    this.dragging.set(false);
    if (this.plane.nativeElement.hasPointerCapture(id)) this.plane.nativeElement.releasePointerCapture(id);
  }

  onPointerLeave(): void {
    if (!this.drag) {
      cancelAnimationFrame(this.pointerFrame);
      this.pointerFrame = 0;
      this.pendingPointer = null;
      this.pointer.set(null);
    }
  }

  openElement(event: Event, element: DemoElement): void {
    event.preventDefault();
    event.stopPropagation();
    const origen = this.origenPendiente();
    if (origen) {
      if (origen.id !== element.id) this.crearRelacion(origen, element);
      return;
    }
    this.informationId.set(null);
    this.contextId.set(element.id);
    cancelAnimationFrame(this.focusFrame);
    this.focusFrame = requestAnimationFrame(() => this.plotArea.nativeElement.querySelector<HTMLButtonElement>('.element-menu button')?.focus());
  }

  showInformation(): void {
    this.informationId.set(this.contextElement()?.id ?? null);
    this.contextId.set(null);
  }

  selectElement(): void {
    this.selectionId.set(this.contextElement()?.id ?? null);
    this.contextId.set(null);
  }

  /** Conserva la apertura desde un elemento de la Hoja y descarta un origen temporal anterior. */
  abrirVentanaProyectar(event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.origenMapaProyeccion.set(null);
    this.proyeccionMapaHost.set(null);
    const origenId = this.contextElement()?.id ?? this.selectedId();
    this.proyectarId.set(origenId);
    this.distanciaProyeccion = '';
    this.azimutProyeccion = null;
    this.nombreProyeccion = '';
    this.tipoGraficacionProyeccion = this.elements.find(item => item.id === origenId)?.tipoGraficacion ?? '';
    this.iconoProyeccion.set(this.iconosService.obtenerIconoSeleccionado());
    this.modalProyectarPosicion.set({ x: 0, y: 0 });
    this.contextId.set(null);
  }

  /** Precarga el origen geografico del mapa sin borrar parametros de un modal ya abierto. */
  abrirProyeccionDesdeMapa(point: GeographicPoint, host: HTMLElement): void {
    if (!validGeographicPoint(point) || this.proyectando) return;
    const abierta = !!this.elementoProyectar();
    if (!abierta) {
      this.distanciaProyeccion = '';
      this.azimutProyeccion = null;
      this.nombreProyeccion = '';
      this.tipoGraficacionProyeccion = '';
      this.iconoProyeccion.set(this.iconosService.obtenerIconoSeleccionado());
      this.modalProyectarPosicion.set({ x: 0, y: 0 });
    }
    this.proyectarId.set(null);
    this.origenMapaProyeccion.set({ ...point });
    this.proyeccionMapaHost.set(host);
    this.contextId.set(null);
  }

  /** Cierra el unico modal y libera su origen temporal sin modificar registros existentes. */
  cerrarVentanaProyectar(event?: Event): void {
    event?.preventDefault();
    event?.stopPropagation();
    this.proyectarId.set(null);
    this.origenMapaProyeccion.set(null);
    this.proyeccionMapaHost.set(null);
    this.terminarDragProyectar();
  }

  iniciarDragProyectar(event: PointerEvent): void {
    if (event.button !== 0 || this.modalDrag || (event.target as Element).closest('button, input, select')) return;
    event.preventDefault();
    event.stopPropagation();
    this.arrastrandoProyectar.set(true);
    const posicion = this.modalProyectarPosicion();
    this.modalDrag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: posicion.x, originY: posicion.y };
    (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  }

  moverDragProyectar(event: PointerEvent): void {
    if (!this.modalDrag || this.modalDrag.pointerId !== event.pointerId) return;
    const dx = event.clientX - this.modalDrag.startX;
    const dy = event.clientY - this.modalDrag.startY;
    this.modalProyectarPosicion.set({ x: this.modalDrag.originX + dx, y: this.modalDrag.originY + dy });
  }

  terminarDragProyectar(event?: PointerEvent): void {
    if (event && this.modalDrag?.pointerId !== event.pointerId) return;
    this.modalDrag = null;
    this.arrastrandoProyectar.set(false);
  }

  actualizarAzimut(value: string | number): void {
    if (value === '' || value == null) { this.azimutProyeccion = null; return; }
    const numero = Number(value);
    this.azimutProyeccion = Number.isFinite(numero) && numero >= 0 && numero < 360 ? (Math.round(numero * 10) / 10) % 360 : null;
  }

  onCompassPointerDown(event: PointerEvent): void {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const target = event.currentTarget as SVGElement;
    target.setPointerCapture(event.pointerId);
    this.actualizarAzimutDesdePuntero(event, target);
  }

  onCompassPointerMove(event: PointerEvent): void {
    event.stopPropagation();
    const target = event.currentTarget as SVGElement;
    if (target.hasPointerCapture(event.pointerId)) this.actualizarAzimutDesdePuntero(event, target);
  }

  onCompassPointerUp(event: PointerEvent): void {
    event.stopPropagation();
    const target = event.currentTarget as SVGElement;
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);
  }

  private actualizarAzimutDesdePuntero(event: PointerEvent, target: SVGElement): void {
    const rect = target.getBoundingClientRect();
    const x = event.clientX - (rect.left + rect.width / 2);
    const y = event.clientY - (rect.top + rect.height / 2);
    this.actualizarAzimut((Math.atan2(x, -y) * 180 / Math.PI + 360) % 360);
  }

  compassX(mark: number): number { return 110 + 96 * Math.sin(mark * Math.PI / 180); }
  compassY(mark: number): number { return 115 - 96 * Math.cos(mark * Math.PI / 180); }
  formatearDms(value: number | undefined, latitud: boolean): string {
    if (!Number.isFinite(value)) return '--';
    const dms = this.decimalADms(value!, latitud);
    return `${dms.hemisferio} ${dms.grados}° ${dms.minutos}' ${dms.segundos.toFixed(3)}"`;
  }

  async proyectarElemento(): Promise<void> {
    const origen = this.elementoProyectar();
    const distancia = Number(this.distanciaProyeccion);
    if (!origen || !Number.isFinite(distancia) || distancia <= 0) { alert('DIGITE UNA DISTANCIA VÁLIDA'); return; }
    if (this.azimutProyeccion === null) { alert('SELECCIONE UN AZIMUT'); return; }
    if (!this.tipoGraficacionProyeccion) { alert('SELECCIONE UN TIPO DE GRAFICACION'); return; }
    if (!this.nombreProyeccion.trim()) { alert('DIGITE UN NOMBRE'); return; }
    if (!this.iconoProyeccion()) { alert('SELECCIONE UN ICONO'); return; }
    console.log('[PROYECTAR] icono utilizado para nuevo punto:', this.iconoProyeccion());
    const destino = this.calcularPuntoProyectado(Number(origen.latitud), Number(origen.longitud), distancia, this.azimutProyeccion);
    if (!destino) { alert('Las coordenadas del punto origen no son válidas.'); return; }
    this.proyectando = true;
    const latitud = this.decimalADms(destino.latitud, true);
    const longitud = this.decimalADms(destino.longitud, false);
    try {
      const response = await this.vulcanoApi.registrarCoordenadas({
        tipo_graficacion: this.tipoGraficacionProyeccion,
        nombre: this.nombreProyeccion.trim(),
        latitud: { hemisferio: latitud.hemisferio as 'N' | 'S', grados: latitud.grados, minutos: latitud.minutos, segundos: latitud.segundos },
        longitud: { hemisferio: longitud.hemisferio as 'W' | 'E', grados: longitud.grados, minutos: longitud.minutos, segundos: longitud.segundos },
        icono: this.iconoProyeccion()!.url,
        icono_id: this.iconoProyeccion()!.id,
      });
      if (!response.ok || !response.registro) throw new Error(response.mensaje || 'No fue posible registrar el punto proyectado.');
      const registro = response.registro.icono
        ? response.registro
        : { ...response.registro, icono: this.iconoProyeccion()!.url, icono_id: this.iconoProyeccion()!.id };
      this.coordenadaRegistrada.emit(registro);
      this.cerrarVentanaProyectar();
    } catch (error) {
      alert(error instanceof Error ? error.message : 'No fue posible registrar el punto proyectado.');
    } finally {
      this.proyectando = false;
    }
  }

  formatearCursorDms(value: number, latitud: boolean): string {
    if (!Number.isFinite(value)) return '--';
    const total = Math.round(Math.abs(value) * 3600 * 100);
    const grados = String(Math.floor(total / 360000)).padStart(2, '0');
    const minutos = String(Math.floor(total / 6000) % 60).padStart(2, '0');
    const segundos = ((total % 6000) / 100).toFixed(2).padStart(5, '0');
    const hemisferio = latitud ? (value < 0 ? 'LS' : 'LN') : (value < 0 ? 'LW' : 'LE');
    return `${hemisferio} ${grados}\u00b0 ${minutos}' ${segundos}"`;
  }

  public async capturarHojaParaInforme(): Promise<string> {
    const captura = await this.svgComoPng(this.plane.nativeElement);
    const rect = this.plane.nativeElement.getBoundingClientRect();
    console.log('[INFORME] hoja capturada:', { width: rect.width, height: rect.height, bytes: captura.length });
    return captura;
  }

  public async capturarPerfilParaInforme(): Promise<string> {
    const svg = this.terrainProfile?.nativeElement.querySelector('svg');
    if (!svg) throw new Error('El perfil no está disponible para el informe.');
    const captura = await this.svgComoPng(svg);
    const rect = svg.getBoundingClientRect();
    console.log('[INFORME] perfil capturado:', { width: rect.width, height: rect.height, bytes: captura.length });
    return captura;
  }

  private async svgComoPng(svg: SVGSVGElement): Promise<string> {
    const rect = svg.getBoundingClientRect();
    const width = Math.max(1, Math.round(rect.width || Number(svg.viewBox.baseVal.width) || 880));
    const height = Math.max(1, Math.round(rect.height || Number(svg.viewBox.baseVal.height) || 225));
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const sourceNodes = [svg, ...Array.from(svg.querySelectorAll('*'))];
    const cloneNodes = [clone, ...Array.from(clone.querySelectorAll('*'))];
    sourceNodes.forEach((node, index) => {
      const styles = getComputedStyle(node);
      const style = Array.from(styles).map(name => `${name}:${styles.getPropertyValue(name)};`).join('');
      cloneNodes[index].setAttribute('style', style);
    });
    await Promise.all(Array.from(clone.querySelectorAll('image')).map(async imageElement => {
      const href = imageElement.getAttribute('href') ?? imageElement.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
      if (!href || href.startsWith('data:')) return;
      const response = await fetch(href);
      if (!response.ok) throw new Error(`No fue posible incluir el icono ${href} en la captura.`);
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        response.blob().then(blob => reader.readAsDataURL(blob), reject);
      });
      imageElement.setAttribute('href', dataUrl);
    }));
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(height));
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const image = new Image();
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
    try {
      await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('No fue posible rasterizar el SVG.')); image.src = url; });
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('No fue posible crear el canvas de informe.');
      context.drawImage(image, 0, 0, width, height);
      this.validarCanvasInforme(canvas);
      return canvas.toDataURL('image/png');
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  private validarCanvasInforme(canvas: HTMLCanvasElement): void {
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas de informe no disponible.');
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let pixelesVisibles = 0;
    for (let index = 0; index < data.length; index += 16) {
      if (data[index + 3] > 0 && data[index] + data[index + 1] + data[index + 2] > 24) pixelesVisibles++;
    }
    if (pixelesVisibles < 12) throw new Error('La captura no contiene representación gráfica válida.');
  }

  ajustarTodo(): void { this.zoomPerfil.set(1); this.panPerfil.set({ x: 0, y: 0 }); }
  restablecerZoom(): void { this.ajustarTodo(); }
  cambiarZoom(delta: number): void { this.zoomPerfil.update(value => this.clamp(value + delta, 0.35, 5)); }
  onPerfilWheel(event: WheelEvent): void { event.preventDefault(); this.cambiarZoom(event.deltaY < 0 ? 0.15 : -0.15); }
  iniciarPanPerfil(event: PointerEvent): void {
    if (this.zoomPerfil() <= 1 || event.button !== 0) return;
    this.perfilPan = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, panX: this.panPerfil().x, panY: this.panPerfil().y };
    (event.currentTarget as SVGElement).setPointerCapture(event.pointerId);
  }
  moverPanPerfil(event: PointerEvent): void {
    if (!this.perfilPan || this.perfilPan.pointerId !== event.pointerId) return;
    this.panPerfil.set({ x: this.perfilPan.panX + event.clientX - this.perfilPan.x, y: this.perfilPan.panY + event.clientY - this.perfilPan.y });
  }
  terminarPanPerfil(): void { this.perfilPan = null; }

  seleccionarIconoProyeccion(icono: (typeof this.iconosDisponibles)[number]): void {
    this.iconosService.seleccionarIcono(icono);
    this.iconoProyeccion.set(this.iconosService.obtenerIconoSeleccionado());
  }

  private calcularPuntoProyectado(latitud: number, longitud: number, distancia: number, azimut: number): { latitud: number; longitud: number } | null {
    if (![latitud, longitud, distancia, azimut].every(Number.isFinite)) return null;
    const radio = 6371000;
    const lat1 = latitud * Math.PI / 180;
    const lon1 = longitud * Math.PI / 180;
    const delta = distancia / radio;
    const theta = azimut * Math.PI / 180;
    const lat2 = Math.asin(Math.sin(lat1) * Math.cos(delta) + Math.cos(lat1) * Math.sin(delta) * Math.cos(theta));
    const lon2 = lon1 + Math.atan2(Math.sin(theta) * Math.sin(delta) * Math.cos(lat1), Math.cos(delta) - Math.sin(lat1) * Math.sin(lat2));
    return { latitud: lat2 * 180 / Math.PI, longitud: ((lon2 * 180 / Math.PI + 540) % 360) - 180 };
  }

  private decimalADms(value: number, latitud: boolean): { hemisferio: string; grados: number; minutos: number; segundos: number } {
    const absoluto = Math.abs(value);
    const grados = Math.floor(absoluto);
    const minutosCompletos = (absoluto - grados) * 60;
    const minutos = Math.floor(minutosCompletos);
    return { hemisferio: latitud ? (value < 0 ? 'S' : 'N') : (value < 0 ? 'W' : 'E'), grados, minutos, segundos: Math.round((minutosCompletos - minutos) * 60 * 1e6) / 1e6 };
  }

  fijarElemento(): void {
    const element = this.contextElement();
    if (!element) return;
    if (this.origenPendienteId() === element.id) {
      this.origenPendienteId.set(null);
      this.selectionId.set(null);
    } else {
      this.origenPendienteId.set(element.id);
      this.selectionId.set(element.id);
    }
    this.contextId.set(null);
  }

  @HostListener('document:pointerdown', ['$event'])
  closeOutside(event: PointerEvent): void {
    const target = event.target;
    if (!(target instanceof Element) || !this.plotArea.nativeElement.contains(target) ||
      !target.closest('.element-menu, .demo-element, .element-information')) {
      this.contextId.set(null);
      this.informationId.set(null);
    }
  }

  /** Cierra tambien el origen temporal al usar el cierre general por Escape. */
  @HostListener('document:keydown.escape')
  closePopovers(): void {
    this.contextId.set(null);
    this.informationId.set(null);
    this.endDrag();
    this.origenPendienteId.set(null);
    this.cerrarVentanaProyectar();
  }

  formatearDistancia(metros: number | null): string {
    if (metros === null) return '--';
    return metros < 1000 ? `${metros.toFixed(0)} m` : `${(metros / 1000).toFixed(2)} km`;
  }

  private crearRelacion(origen: DemoElement, destino: DemoElement): void {
    const values = [origen.x, origen.y, destino.x, destino.y, origen.latitud, origen.longitud, destino.latitud, destino.longitud];
    if (values.some(value => !Number.isFinite(value))) {
      console.warn('[FIJAR] Relación descartada por coordenadas inválidas');
      return;
    }
    const dx = destino.x - origen.x;
    const dy = destino.y - origen.y;
    const relacion: RelacionFijada = {
      origenId: origen.id, destinoId: destino.id,
      origen: { id: origen.id, latitud: origen.latitud!, longitud: origen.longitud!, x: origen.x, y: origen.y },
      destino: { id: destino.id, latitud: destino.latitud!, longitud: destino.longitud!, x: destino.x, y: destino.y },
      distanciaMetros: Math.hypot(dx, dy),
      azimutGrados: (Math.atan2(dx, dy) * 180 / Math.PI + 360) % 360,
    };
    this.relacion.set(relacion);
    this.relacionFijada.emit(relacion);
    this.origenPendienteId.set(null);
    this.selectionId.set(origen.id);
  }

  private clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  private normalizarRegistros(value: readonly unknown[] | null | undefined): readonly DemoElement[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const ids = new Set<string>();
    const validos: DemoElement[] = [];
    for (const item of value) {
      const element = this.esElementoValido(item)
        ? item
        : this.convertirRegistroGeografico(item);
      if (!element || ids.has(element.id)) {
        continue;
      }

      ids.add(element.id);
      validos.push(Object.freeze({ ...element }));
    }

    return Object.freeze(validos);
  }

  private actualizarRegistros(value: readonly unknown[] | null | undefined): void {
    if (!Array.isArray(value) || value.length === 0) {
      return;
    }

    const normalizados = this.normalizarRegistros(value);
    const actuales = this.registrosLocalesInternos();
    const mapa = new Map(actuales.map(element => [element.id, element]));
    const hayNuevos = normalizados.some(element => !mapa.has(element.id));

    for (const element of normalizados) {
      mapa.set(element.id, element);
    }

    const resultado = Object.freeze([...mapa.values()]);
    this.registrosLocalesInternos.set(resultado);

    if (hayNuevos) {
      this.ajustarVistaAElementos(resultado);
    }
  }

  private ajustarVistaAElementos(elementos: readonly DemoElement[]): void {
    if (elementos.length === 0) {
      return;
    }

    const xValues = elementos.map(element => element.x);
    const yValues = elementos.map(element => element.y);
    const minX = Math.min(...xValues);
    const maxX = Math.max(...xValues);
    const minY = Math.min(...yValues);
    const maxY = Math.max(...yValues);
    const spanX = maxX - minX;
    const spanY = maxY - minY;

    this.center.set({ x: (minX + maxX) / 2, y: (minY + maxY) / 2 });

    if (elementos.length > 1) {
      const baseScale = Math.min(this.viewport().width / 420, this.viewport().height / 260);
      const availableWidth = this.viewport().width * 0.8;
      const availableHeight = this.viewport().height * 0.8;
      const zoomX = spanX > 0 ? availableWidth / (spanX * baseScale) : this.maxZoom;
      const zoomY = spanY > 0 ? availableHeight / (spanY * baseScale) : this.maxZoom;
      // EPSG:9377 está expresado en metros; para separar puntos regionales
      // el fit puede requerir un zoom menor que el límite de interacción.
      const zoomNecesario = Math.min(zoomX, zoomY);
      this.zoom.set(this.clamp(zoomNecesario, this.minZoom, this.maxZoom));
    }

  }

  private esElementoValido(value: unknown): value is DemoElement {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const element = value as Partial<DemoElement>;
    return typeof element.id === 'string' && !!element.id.trim() &&
      typeof element.name === 'string' &&
      typeof element.icon === 'string' &&
      typeof element.color === 'string' &&
      typeof element.x === 'number' && Number.isFinite(element.x) &&
      typeof element.y === 'number' && Number.isFinite(element.y);
  }

  private convertirRegistroGeografico(value: unknown): DemoElement | null {
    if (!this.esRegistroGeografico(value)) {
      return null;
    }

    const latitud = Number(value.latitud);
    const longitud = Number(value.longitud);
    if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) {
      console.warn('[HOJA MILIMETRADA] Registro descartado: coordenada invalida', value.id);
      return null;
    }

    const projected = this.convertirWgs84AOrigenNacional(longitud, latitud);
    if (!projected) {
      console.warn('[HOJA MILIMETRADA] Conversion EPSG:9377 invalida', value.id);
      return null;
    }

    return {
      id: value.id,
      name: value.nombre,
      tipoGraficacion: value.tipo_graficacion,
      latitud,
      longitud,
      x: projected.x,
      y: projected.y,
      projectedX: projected.x,
      projectedY: projected.y,
      iconUrl: value.icono,
      icon: 'M 0 -7 A 7 7 0 1 1 0 7 A 7 7 0 1 1 0 -7 Z',
      color: '#5ca4ff',
    };
  }

  private esRegistroGeografico(value: unknown): value is RegistroCoordenada {
    if (!value || typeof value !== 'object') {
      return false;
    }

    const registro = value as Partial<RegistroCoordenada>;
    return typeof registro.id === 'string' && !!registro.id.trim() && typeof registro.nombre === 'string';
  }

  private referenciasGeograficas(axis: 'x' | 'y'): { pixel: number; label: string }[] {
    const length = axis === 'x' ? this.viewport().width : this.viewport().height;
    const count = Math.floor(length / (axis === 'x' ? 190 : 110));
    return Array.from({ length: count }, (_, index) => {
      const pixel = length * (index + 1) / (count + 1);
      const screen = axis === 'x' ? { x: pixel, y: this.viewport().height } : { x: 0, y: pixel };
      const geographic = this.convertirOrigenNacionalAWgs84(this.toLocal(screen));
      return { pixel, label: geographic ? `${axis === 'x' ? 'LON' : 'LAT'} ${(axis === 'x' ? geographic.longitud : geographic.latitud).toFixed(6)}\u00b0` : '' };
    }).filter(reference => reference.label);
  }

  private convertirOrigenNacionalAWgs84(point: LocalPoint): { latitud: number; longitud: number } | null {
    // Invert the existing forward projection, keeping its exact CRS and coefficients.
    let latitud = 4;
    let longitud = -73;
    const h = 0.00001;
    for (let iteration = 0; iteration < 12; iteration++) {
      const projected = this.convertirWgs84AOrigenNacional(longitud, latitud);
      const north = this.convertirWgs84AOrigenNacional(longitud, latitud + h);
      const east = this.convertirWgs84AOrigenNacional(longitud + h, latitud);
      if (!projected || !north || !east) return null;
      const dx = point.x - projected.x;
      const dy = point.y - projected.y;
      if (Math.hypot(dx, dy) < 0.0001) return { latitud, longitud };
      const xx = (east.x - projected.x) / h;
      const yx = (east.y - projected.y) / h;
      const xy = (north.x - projected.x) / h;
      const yy = (north.y - projected.y) / h;
      const determinant = xx * yy - xy * yx;
      if (!Number.isFinite(determinant) || Math.abs(determinant) < 1e-10) return null;
      longitud += (dx * yy - xy * dy) / determinant;
      latitud += (xx * dy - dx * yx) / determinant;
      if (!Number.isFinite(latitud) || !Number.isFinite(longitud)) return null;
    }
    return null;
  }

  // MAGNA-SIRGAS / Origen-Nacional (EPSG:9377), the official Colombian TM projection.
  private convertirWgs84AOrigenNacional(longitud: number, latitud: number): LocalPoint | null {
    if (latitud < -90 || latitud > 90 || longitud < -180 || longitud > 180) {
      return null;
    }

    const a = 6_378_137;
    const inverseFlattening = 298.257222101;
    const flattening = 1 / inverseFlattening;
    const eccentricitySquared = flattening * (2 - flattening);
    const secondEccentricitySquared = eccentricitySquared / (1 - eccentricitySquared);
    const scaleFactor = 0.9992;
    const falseEasting = 5_000_000;
    const falseNorthing = 2_000_000;
    const latitudeOfOrigin = 4 * Math.PI / 180;
    const centralMeridian = -73 * Math.PI / 180;
    const latitude = latitud * Math.PI / 180;
    const longitude = longitud * Math.PI / 180;
    const meridionalArc = (angle: number): number => a * (
      (1 - eccentricitySquared / 4 - 3 * eccentricitySquared ** 2 / 64 - 5 * eccentricitySquared ** 3 / 256) * angle
      - (3 * eccentricitySquared / 8 + 3 * eccentricitySquared ** 2 / 32 + 45 * eccentricitySquared ** 3 / 1024) * Math.sin(2 * angle)
      + (15 * eccentricitySquared ** 2 / 256 + 45 * eccentricitySquared ** 3 / 1024) * Math.sin(4 * angle)
      - (35 * eccentricitySquared ** 3 / 3072) * Math.sin(6 * angle)
    );
    const sinLatitude = Math.sin(latitude);
    const cosLatitude = Math.cos(latitude);
    const tangentSquared = Math.tan(latitude) ** 2;
    const radiusOfCurvature = a / Math.sqrt(1 - eccentricitySquared * sinLatitude ** 2);
    const c = secondEccentricitySquared * cosLatitude ** 2;
    const d = cosLatitude * (longitude - centralMeridian);
    const x = falseEasting + scaleFactor * radiusOfCurvature * (
      d + (1 - tangentSquared + c) * d ** 3 / 6 + (5 - 18 * tangentSquared + tangentSquared ** 2 + 72 * c - 58 * secondEccentricitySquared) * d ** 5 / 120
    );
    const y = falseNorthing + scaleFactor * (
      meridionalArc(latitude) - meridionalArc(latitudeOfOrigin)
      + radiusOfCurvature * Math.tan(latitude) * (
        d ** 2 / 2 + (5 - tangentSquared + 9 * c + 4 * c ** 2) * d ** 4 / 24
        + (61 - 58 * tangentSquared + tangentSquared ** 2 + 600 * c - 330 * secondEccentricitySquared) * d ** 6 / 720
      )
    );
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }



// ==========================================
// CURVAS DE NIVEL
// ==========================================

private readonly curvasService = inject(CurvasNivelService);

readonly mostrarCurvasNivel = signal(false);
/**
 * Controla las consultas automáticas de curvas.
 *
 * true: actualiza al mover o cambiar el zoom.
 * false: permite únicamente consultas manuales.
 */
readonly curvasAutomaticas = signal(false);

/**
 * Habilita o deshabilita la actualización automática.
 */
/**
 * Activa o desactiva la actualización automática.
 *
 * Al desactivar, cancela la petición pendiente.
 * Las curvas ya descargadas permanecen visibles.
 */
alternarCurvasAutomaticas(): void {

  const activar = !this.curvasAutomaticas();

  this.curvasAutomaticas.set(activar);

  if (!activar) {
    this.peticionCurvas?.unsubscribe();
    this.peticionCurvas = undefined;
    this.cargandoCurvas.set(false);
  }

  console.log(
    '[CURVAS] Modo automático:',
    activar ? 'ACTIVADO' : 'DESACTIVADO'
  );
}

readonly curvasNivel = signal<CurvaNivelFeature[]>([]);

readonly cargandoCurvas = signal(false);

readonly errorCurvas = signal<string | null>(null);

alternarCurvasNivel(): void {
  this.mostrarCurvasNivel.update(valor => !valor);
}

/**
 * Centra la hoja milimetrada en una coordenada
 * geográfica, utilizando la proyección existente.
 *
 * No modifica los registros ni las transformaciones.
 */
centrarHojaEnCoordenadas(
  longitud: number,
  latitud: number
): void {

  const punto = this.convertirWgs84AOrigenNacional(
    longitud,
    latitud
  );

  if (!punto) {
    console.error(
      '[CURVAS] No fue posible proyectar la coordenada.'
    );
    return;
  }

  this.center.set({
    x: punto.x,
    y: punto.y
  });

  console.log(
    '[CURVAS] Hoja centrada en:',
    punto
  );
}

/**
 * Prueba de posicionamiento geográfico.
 *
 * Utiliza una ubicación de Bogotá para comprobar
 * que la hoja admite coordenadas EPSG:9377.
 */

/**
 * Centra la Hoja Milimetrada en Bogotá.
 *
 * Utiliza las coordenadas EPSG:9377.
 * No modifica registros, relaciones ni elementos.
 */
probarCentroCurvas(): void {

  const longitud = -74.08;
  const latitud = 4.60;

  const punto =
    this.convertirWgs84AOrigenNacional(
      longitud,
      latitud
    );

  if (!punto) {
    console.error(
      '[CURVAS] No fue posible proyectar Bogotá.'
    );
    return;
  }

  // Primero se establece el centro geográfico.
  this.center.set({
    x: punto.x,
    y: punto.y
  });

  // Escala de prueba para visualizar una zona
  // geográfica más amplia.
  this.zoom.set(0.05);

  console.log(
    '[CURVAS] Centro geográfico activado:',
    punto
  );

  console.log(
    '[CURVAS] BBOX geográfico:',
    this.calcularBBoxVisible()
  );
}


/**
 * Consulta las curvas de nivel en una zona de prueba.
 *
 * La consulta es manual y no modifica:
 * - Zoom del plano.
 * - Posición del centro.
 * - Elementos registrados.
 * - Cuadrícula existente.
 */

/**
 * Consulta manualmente las curvas de nivel
 * correspondientes al área visible.
 *
 * No modifica el zoom, centro ni elementos.
 */

/**
 * Divide una extensión geográfica en sectores
 * pequeños para evitar consultas demasiado grandes.
 */
private dividirBBoxEnSectores(
  bbox: {
    west: number;
    south: number;
    east: number;
    north: number;
  },
  tamano = 0.15
) {
  const sectores: typeof bbox[] = [];

  for (let south = bbox.south; south < bbox.north; south += tamano) {
    for (let west = bbox.west; west < bbox.east; west += tamano) {
      sectores.push({
        west,
        south,
        east: Math.min(west + tamano, bbox.east),
        north: Math.min(south + tamano, bbox.north)
      });
    }
  }

  return sectores;
}



/**
 * Consulta curvas de nivel por sectores geográficos.
 *
 * - Divide el área visible en sectores de 0.15°.
 * - Consulta secuencialmente para evitar sobrecargas.
 * - Prioriza los sectores cercanos al centro.
 * - Permite cancelar consultas anteriores.
 * - Conserva el control manual y automático.
 */
cargarCurvasNivel(): void {

  this.peticionCurvas?.unsubscribe();
  this.peticionCurvas = undefined;

  this.cargandoCurvas.set(false);
  this.errorCurvas.set(null);

  const detalle = this.obtenerDetalleCurvas();
  const bbox = this.calcularBBoxVisible();

  if (!bbox) {
    this.errorCurvas.set(
      'No fue posible determinar el área visible.'
    );
    return;
  }

  const cobertura = {
    west: -79.0001388888889,
    south: -4.99992840778923,
    east: -65.9997278293635,
    north: 12.459722222197
  };

  const bboxConsulta = {
    west: Math.max(bbox.west, cobertura.west),
    south: Math.max(bbox.south, cobertura.south),
    east: Math.min(bbox.east, cobertura.east),
    north: Math.min(bbox.north, cobertura.north)
  };

  if (
    bboxConsulta.west >= bboxConsulta.east ||
    bboxConsulta.south >= bboxConsulta.north
  ) {
    this.errorCurvas.set(
      'La zona visible está fuera de cobertura.'
    );
    return;
  }

  const centro = {
    x: (bboxConsulta.west + bboxConsulta.east) / 2,
    y: (bboxConsulta.south + bboxConsulta.north) / 2
  };

  // Máximo inicial para proteger el navegador.
  const MAX_SECTORES = 25;

  const todosLosSectores =
    this.dividirBBoxEnSectores(bboxConsulta, 0.15);

  // Priorizar sectores cercanos al centro de la vista.
  const sectores = todosLosSectores
    .sort((a, b) => {
      const distancia = (sector: typeof bboxConsulta) => {
        const x = (sector.west + sector.east) / 2;
        const y = (sector.south + sector.north) / 2;

        return (
          Math.pow(x - centro.x, 2) +
          Math.pow(y - centro.y, 2)
        );
      };

      return distancia(a) - distancia(b);
    })
    .slice(0, MAX_SECTORES);

  if (!sectores.length) return;

  const resultados: CurvaNivelFeature[] = [];

  this.cargandoCurvas.set(true);

  console.log('[CURVAS] Sectores:', {
    total: todosLosSectores.length,
    seleccionados: sectores.length
  });

  this.peticionCurvas = from(sectores)
    .pipe(
      concatMap(sector =>
        this.curvasService.consultarBBox(
          sector,
          detalle.intervalo,
          detalle.simplify
        )
      ),
      finalize(() => {
        this.cargandoCurvas.set(false);
      }),
      takeUntilDestroyed(this.destroyRef)
    )
    .subscribe({
      next: respuesta => {
        resultados.push(...(respuesta.features ?? []));

        // Publicar progresivamente las curvas.
        this.curvasNivel.set([...resultados]);
        this.mostrarCurvasNivel.set(true);

        console.log(
          '[CURVAS] Geometrías acumuladas:',
          resultados.length
        );
      },

      error: error => {
        console.error('[CURVAS] Error:', error);

        this.errorCurvas.set(
          'La consulta se interrumpió. Se conservaron los sectores recibidos.'
        );
      },

      complete: () => {
        this.curvasConsultadas.set(true);

        // Solo registrar cobertura completa cuando
        // todos los sectores fueron consultados.
        if (sectores.length === todosLosSectores.length) {
          this.bboxCurvasCargadas.set({
            ...bboxConsulta
          });
        } else {
          this.bboxCurvasCargadas.set(null);
          console.warn(
            '[CURVAS] Cobertura parcial:',
            sectores.length,
            'de',
            todosLosSectores.length
          );
        }

        console.log(
          '[CURVAS] Consulta finalizada:',
          resultados.length
        );
      }
    });
}


/**
 * Convierte las geometrías GeoJSON en líneas SVG.
 *
 * GeoJSON utiliza coordenadas WGS84:
 * [longitud, latitud].
 *
 * La hoja utiliza coordenadas proyectadas.
 */
readonly curvasNivelPantalla = computed(() => {

  // Estas dependencias permiten actualizar las líneas
  // cuando cambia el zoom, centro o tamaño del plano.
  this.center();
  this.scale();
  this.viewport();

  if (!this.mostrarCurvasNivel()) {
    return [];
  }

  const resultado: {
    id: string;
    puntos: string;
    elevacion: number;
    principal: boolean;
  }[] = [];

  this.curvasNivel().forEach((feature, indice) => {

    const geometry = feature.geometry;

    if (!geometry) return;

    const lineas: number[][][] =
      geometry.type === 'LineString'
        ? [geometry.coordinates as number[][]]
        : geometry.coordinates as number[][][];

    lineas.forEach((linea, subindice) => {

      const puntos = linea
        .filter(coordenada =>
          coordenada.length >= 2 &&
          Number.isFinite(coordenada[0]) &&
          Number.isFinite(coordenada[1])
        )
        .map(([longitud, latitud]) => {

          const proyectado =
            this.convertirWgs84AOrigenNacional(
              longitud,
              latitud
            );

          if (!proyectado) return null;

          return this.toScreen(proyectado);

        })
        .filter((punto): punto is {
          x: number;
          y: number;
        } => punto !== null);

      if (puntos.length < 2) return;

      resultado.push({
        id: `${indice}-${subindice}`,
        puntos: puntos
          .map(punto => `${punto.x},${punto.y}`)
          .join(' '),
        elevacion: feature.properties.elevacion,
        principal: feature.properties.principal
      });

    });

  });

  return resultado;
});


/**
 * Calcula el área geográfica visible del plano.
 *
 * Convierte las cuatro esquinas del SVG:
 * 1. Pantalla -> coordenadas locales.
 * 2. Coordenadas locales -> WGS84.
 *
 * Devuelve un BBOX compatible con /api/curvas/bbox.
 *
 * No modifica el estado del componente.
 */
calcularBBoxVisible(): {
  west: number;
  south: number;
  east: number;
  north: number;
} | null {

  const { width, height } = this.viewport();

  if (width <= 0 || height <= 0) {
    return null;
  }

  const esquinas = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: width, y: height },
    { x: 0, y: height }
  ];

  const coordenadas = esquinas.map(esquina => {

    const puntoLocal = this.toLocal(esquina);

    return this.convertirOrigenNacionalAWgs84(
      puntoLocal
    );

  });

  const validas = coordenadas.filter(
    (punto): punto is {
      longitud: number;
      latitud: number;
    } =>
      punto !== null &&
      Number.isFinite(punto.longitud) &&
      Number.isFinite(punto.latitud)
  );

  if (validas.length !== 4) {
    console.warn(
      '[CURVAS] No fue posible calcular el BBOX.'
    );
    return null;
  }

  return {
    west: Math.min(...validas.map(p => p.longitud)),
    south: Math.min(...validas.map(p => p.latitud)),
    east: Math.max(...validas.map(p => p.longitud)),
    north: Math.max(...validas.map(p => p.latitud))
  };
}

/**
 * Muestra en consola el BBOX visible.
 * No realiza peticiones HTTP.
 */
probarBBoxVisible(): void {

  const bbox = this.calcularBBoxVisible();

  if (!bbox) {
    console.error(
      '[CURVAS] BBOX no disponible.'
    );
    return;
  }

  console.table(bbox);

  console.log(
    '[CURVAS] BBOX visible:',
    bbox
  );
}

/**
 * Diagnóstico de transformación geográfica.
 *
 * Comprueba si una coordenada WGS84 puede
 * convertirse a coordenadas proyectadas y
 * regresar a su valor original.
 */
probarConversionCoordenadas(): void {

  const longitud = -74.08;
  const latitud = 4.60;

  const proyectado =
    this.convertirWgs84AOrigenNacional(
      longitud,
      latitud
    );

  console.log(
    '[DIAGNÓSTICO] Coordenada original:',
    { longitud, latitud }
  );

  console.log(
    '[DIAGNÓSTICO] Coordenada proyectada:',
    proyectado
  );

  if (!proyectado) {
    console.error(
      '[DIAGNÓSTICO] Falló la proyección.'
    );
    return;
  }

  const recuperado =
    this.convertirOrigenNacionalAWgs84(
      proyectado
    );

  console.log(
    '[DIAGNÓSTICO] Coordenada recuperada:',
    recuperado
  );

  console.log(
    '[DIAGNÓSTICO] Centro actual:',
    this.center()
  );

  console.log(
    '[DIAGNÓSTICO] Zoom actual:',
    this.zoom()
  );
}

/**
 * Área geográfica de la última consulta exitosa.
 *
 * Se conserva para identificar cuándo el usuario
 * se desplaza fuera de la cobertura cargada.
 */
readonly bboxCurvasCargadas = signal<{
  west: number;
  south: number;
  east: number;
  north: number;
} | null>(null);

/**
 * Indica si existen datos de curvas cargados.
 * Se diferencia de la visibilidad de la capa.
 */
readonly curvasConsultadas = signal(false);

/**
 * Detecta cuando la zona visible ya no está
 * completamente cubierta por los datos cargados.
 *
 * No ejecuta consultas HTTP.
 */
readonly zonaCurvasDesactualizada = computed(() => {

  const cargado = this.bboxCurvasCargadas();

  if (!cargado || !this.curvasConsultadas()) {
    return false;
  }

  const visible = this.calcularBBoxVisible();

  if (!visible) {
    return false;
  }

  const tolerancia = 0.000001;

  return (
    visible.west < cargado.west - tolerancia ||
    visible.south < cargado.south - tolerancia ||
    visible.east > cargado.east + tolerancia ||
    visible.north > cargado.north + tolerancia
  );
});

/**
 * Muestra u oculta las curvas ya descargadas.
 *
 * No realiza peticiones al backend.
 */
alternarVisibilidadCurvas(): void {

  if (!this.curvasConsultadas()) {
    return;
  }

  this.mostrarCurvasNivel.update(
    visible => !visible
  );
}

/**
 * Elimina las curvas descargadas de la memoria
 * del componente.
 *
 * No afecta otros elementos del plano.
 */
limpiarCurvasNivel(): void {

  if (this.cargandoCurvas()) {
    return;
  }

  this.curvasNivel.set([]);
  this.bboxCurvasCargadas.set(null);
  this.curvasConsultadas.set(false);
  this.mostrarCurvasNivel.set(false);
  this.errorCurvas.set(null);

  console.log(
    '[CURVAS] Datos descargados liberados.'
  );
}

/**
 * Selecciona el detalle de las curvas según la
 * escala visual del plano.
 */
private obtenerDetalleCurvas(): {
  intervalo: 50 | 100 | 200 | 500;
  simplify: number;
} {
  const escala = this.scale();

  if (escala >= 0.5) {
    return { intervalo: 50, simplify: 2 };
  }

  if (escala >= 0.15) {
    return { intervalo: 100, simplify: 5 };
  }

  if (escala >= 0.05) {
    return { intervalo: 200, simplify: 15 };
  }

  return { intervalo: 500, simplify: 40 };
}

/**
 * Indica si la Hoja Milimetrada está
 * actualmente en pantalla completa.
 */
readonly pantallaCompleta = signal(false);

/**
 * Activa o desactiva la pantalla completa
 * utilizando la API nativa del navegador.
 */

/**
 * Activa o desactiva la pantalla completa
 * de todo el panel de la Hoja Milimetrada.
 *
 * Incluye encabezado, SVG y controles.
 */
async alternarPantallaCompleta(): Promise<void> {
  const contenedor = this.hojaCompleta?.nativeElement;

  if (!contenedor) return;

  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await contenedor.requestFullscreen();
    }
  } catch (error) {
    console.error(
      '[HOJA MILIMETRADA] Error de pantalla completa:',
      error
    );
  }
}

/**
 * Actualiza el estado al entrar o salir
 * de pantalla completa, incluso con ESC.
 */
@HostListener('document:fullscreenchange')
actualizarEstadoPantallaCompleta(): void {
  this.pantallaCompleta.set(
    document.fullscreenElement ===
    this.hojaCompleta?.nativeElement
  );
}



}
