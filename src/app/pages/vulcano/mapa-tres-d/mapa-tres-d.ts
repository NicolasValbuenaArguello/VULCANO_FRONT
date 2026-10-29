import { CartographyConfigService } from '../../../shared/services/cartography-config.service';
import { MeasurementService } from '../../../shared/components/geographic-measurement/measurement.service';
import { MapLibreMeasurementAdapter } from '../../../shared/components/geographic-measurement/measurement-adapters';
import { ApplicationRef, EnvironmentInjector } from '@angular/core';
import { attachMeasurementTools } from '../../../shared/components/geographic-measurement/measurement-overlay';
import { createMapLayersHeader, MAP_LAYERS_ICON, observeMapLayersViewport } from '../../../shared/components/map-layers/map-layers-ui';
import { MapActionsService, mapActionTarget, validGeographicPoint } from '../../../shared/components/map-context-menu/map-actions.service';
import { PuntoCapturaVisual } from '../../../shared/models/punto-captura-visual.model';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  DestroyRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import * as maplibregl from 'maplibre-gl';
import { MapLibrePointLayer } from '../../../shared/geographic-points/point-layers';
import { construirTrayectoria3D } from './trayectoria-3d';
import type {
  IControl,
  Map as MapLibreMap,
  RasterDEMSourceSpecification,
  StyleSpecification,
} from 'maplibre-gl';
import { RegistroCoordenada, SimulacionTrayectoriaResponse, VulcanoApiService } from '../../../core/services/vulcano-api.service';
import { environment } from '../../../../environments/environment';
import { ElementoMapa } from '../../../shared/models/elemento-mapa.model';
import { MapaElementosService } from '../../../shared/services/mapa-elementos.service';
import { RelacionFijada } from '../../../shared/models/relacion-fijada.model';
import type { FeaturePoligono } from
  '../ventana-limites-seguridad/ventana-limites-seguridad';

type BaseMapId = 'streets' | 'satellite' | 'topographic' | 'light' | 'dark';
type BaseMapType = 'raster' | 'style';

interface BaseMapConfig {
  enabled: boolean;
  id: BaseMapId;
  name: string;
  provider: string;
  type: BaseMapType;
  tiles?: string[];
  styleUrl?: string;
  tileSize?: number;
  attribution?: string;
  requiresApiKey?: boolean;
  minZoom?: number;
  maxZoom?: number;
  bounds?: [number, number, number, number];
}

interface PendingBaseMapChange {
  token: number;
  baseMapId: BaseMapId;
  config: BaseMapConfig;
  sourceId: string;
  layerId: string;
  previousSourceId: string;
  previousLayerId: string;
  timeoutId: number;
  blackGapTimerId: number;
  sourceDataHandler: (event: { sourceId?: string; isSourceLoaded?: boolean }) => void;
}

type DemDiagnosticStatus = 'PASS' | 'FAIL' | 'RUNNING';

interface DemDiagnosticResult {
  test: string;
  status: DemDiagnosticStatus;
  message: string;
  phase?: 'official' | 'local';
  loadReceived?: boolean;
  projection?: string | null;
  styleLoaded?: boolean;
  sourceExists?: boolean;
  hillshadeSourceExists?: boolean;
  sourceLoaded?: boolean;
  idleReached?: boolean;
  terrainSource?: string | null;
  elevation?: number | null;
  tileJsonOk?: boolean;
  tileJsonStatus?: number | null;
  tileJsonContentType?: string | null;
  tileJsonTiles?: string[] | null;
  tileJsonMinzoom?: number | null;
  tileJsonMaxzoom?: number | null;
  tileJsonBounds?: number[] | null;
  tileJsonScheme?: string | null;
  backendElevation?: number | null;
  minElevation?: number | null;
  maxElevation?: number | null;
  meanElevation?: number | null;
  alphaMin?: number | null;
  alphaMax?: number | null;
  width?: number;
  height?: number;
  timeoutStage?: 'style' | 'source' | 'idle';
}

interface DemMapErrorContext extends Record<string, unknown> {
  message: string | null;
  sourceId: string | null;
  status: unknown;
  tile: unknown;
  url: string | null;
}

interface BaseMapTileErrorContext extends Record<string, unknown> {
  message: string | null;
  sourceId: string | null;
  status: unknown;
  tile: unknown;
  url: string | null;
}

interface DemRealTileCheck {
  url: string;
  z: number | null;
  x: number | null;
  y: number | null;
  status: number | null;
  ok: boolean;
  bytes: number | null;
  width: number | null;
  height: number | null;
  minElevation: number | null;
  maxElevation: number | null;
  meanElevation: number | null;
  alphaMin: number | null;
  alphaMax: number | null;
  contentType: string | null;
  contentLength: string | null;
  cacheControl: string | null;
  accessControlAllowOrigin: string | null;
  intersectsDemBounds: boolean | null;
  isUniform: boolean | null;
  error: string | null;
  source: 'terrarium' | 'custom' | 'unknown';
}

class BaseMapControl implements IControl {

  // ======================================================
// LÍMITES DE SEGURIDAD - GEOJSON
// ======================================================




  private map: MapLibreMap | null = null;
  private container: HTMLDivElement | null = null;
  private button: HTMLButtonElement | null = null;
  private panel: HTMLDivElement | null = null;
  private isOpen = false;
  private stopViewportObservation?: () => void;
  private requestedBaseMapId: BaseMapId | null = null;
  private readonly onDocumentPointerDown = (event: PointerEvent) => this.handleDocumentPointerDown(event);

  constructor(
    private readonly configs: Record<BaseMapId, BaseMapConfig>,
    private activeBaseMapId: BaseMapId,
    private readonly onChange: (baseMapId: BaseMapId) => void,
  ) {}

  /** Construye el selector con la apariencia compartida y aisla los gestos del panel. */
  onAdd(map: MapLibreMap): HTMLElement {
    this.map = map;
    this.container = document.createElement('div');
    this.container.className = 'maplibre-basemap-control vulcano-map-layers maplibregl-ctrl';
    for (const type of ['pointerdown', 'mousedown', 'dblclick', 'wheel', 'touchstart']) {
      this.container.addEventListener(type, event => event.stopPropagation());
    }
    this.container.addEventListener('keydown', event => {
      if (event.key === 'Escape') { this.closePanel(); this.button?.focus(); }
      event.stopPropagation();
    });

    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'maplibre-basemap-button';
    this.button.setAttribute('aria-label', 'Capas del mapa');
    this.button.title = 'Capas del mapa';
    this.button.setAttribute('aria-expanded', 'false');
    this.button.innerHTML = MAP_LAYERS_ICON;
    this.button.addEventListener('click', this.togglePanel);

    this.panel = document.createElement('div');
    this.panel.className = 'maplibre-basemap-panel';
    this.panel.inert = true;
    this.panel.setAttribute('aria-hidden', 'true');
    this.panel.appendChild(createMapLayersHeader());
    this.panel.appendChild(this.createOptions());

    this.container.append(this.button, this.panel);
    this.syncSelection();
    this.stopViewportObservation = observeMapLayersViewport(this.container, map.getContainer());
    document.addEventListener('pointerdown', this.onDocumentPointerDown, true);

    return this.container;
  }

  /** Libera los eventos y la observacion del espacio disponible al retirar el control. */
  onRemove(): void {
    this.stopViewportObservation?.();
    this.stopViewportObservation = undefined;
    document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
    this.button?.removeEventListener('click', this.togglePanel);
    this.button = null;
    this.panel = null;
    this.container?.remove();
    this.container = null;
    this.map = null;
  }

  setActiveBaseMap(baseMapId: BaseMapId): void {
    this.activeBaseMapId = this.configs[baseMapId].enabled ? baseMapId : Object.values(this.configs).find(config => config.enabled)!.id;
    this.requestedBaseMapId = null;
    this.syncSelection();
  }

  setRequestedBaseMap(baseMapId: BaseMapId | null): void {
    this.requestedBaseMapId = baseMapId;
    this.syncSelection();
  }

  private createOptions(): HTMLElement {
    const options = document.createElement('div');
    options.className = 'maplibre-basemap-options';

    for (const config of Object.values(this.configs)) {
      const label = document.createElement('label');
      label.className = 'maplibre-basemap-option';

      const input = document.createElement('input');
      input.type = 'radio';
      input.disabled = !config.enabled;
      label.classList.toggle('map-base-disabled', !config.enabled);
      label.setAttribute('aria-disabled', String(!config.enabled));
      input.name = 'maplibre-basemap';
      input.dataset['baseMapId'] = config.id;
      input.checked = config.id === (this.requestedBaseMapId ?? this.activeBaseMapId);
      input.addEventListener('change', () => {
        if (!config.enabled || !input.checked) {
          return;
        }

        console.log('[BaseMapControl] Seleccionado:', config.id);
        this.onChange(config.id);
        this.closePanel();
      });

      const text = document.createElement('span');
      text.textContent = config.name;

      label.append(input, text);
      options.appendChild(label);
    }

    return options;
  }

  private togglePanel = (event: MouseEvent): void => {
    event.preventDefault();
    event.stopPropagation();

    this.isOpen = !this.isOpen;
    this.syncPanel();
  };

  private closePanel(): void {
    this.isOpen = false;
    this.syncPanel();
  }

  /** Sincroniza apertura visual, accesibilidad y seleccion sin recrear las opciones. */
  private syncPanel(): void {
    if (!this.button || !this.panel) {
      return;
    }

    this.button.setAttribute('aria-expanded', String(this.isOpen));
    this.panel.inert = !this.isOpen;
    this.panel.setAttribute('aria-hidden', String(!this.isOpen));

    this.syncSelection();
  }

  private syncSelection(): void {
    if (!this.panel) {
      return;
    }

    const inputs = this.panel.querySelectorAll<HTMLInputElement>('input[type="radio"]');
    for (const input of inputs) {
      input.checked = input.dataset['baseMapId'] === (this.requestedBaseMapId ?? this.activeBaseMapId);
    }

    const allLabels = this.panel.querySelectorAll<HTMLLabelElement>('.maplibre-basemap-option');
    for (const label of allLabels) {
      const input = label.querySelector<HTMLInputElement>('input[type="radio"]');
      label.classList.toggle('maplibre-basemap-option--active', !!input?.checked);
    }
  }

  private handleDocumentPointerDown(event: PointerEvent): void {
    const target = event.target as Node | null;
    if (!target || !this.container || this.container.contains(target)) {
      return;
    }

    this.closePanel();
  }
}

@Component({
  selector: 'app-mapa-tres-d',
  standalone: true,
  templateUrl: './mapa-tres-d.html',
  styleUrl: './mapa-tres-d.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapaTresD implements AfterViewInit, OnChanges, OnInit, OnDestroy {
  @Input() puntosGeograficos: GeoJSON.FeatureCollection = { type: 'FeatureCollection', features: [] };
  private readonly puntosLayer = new MapLibrePointLayer();
  /** Invalida solo la disponibilidad del estilo de PUNTOS durante su sustitucion. */
  private readonly handlePuntosStyleLoading = (): void => this.puntosLayer.styleLoading();

  // ======================================================
// LÍMITES DE SEGURIDAD - GEOJSON
// ======================================================

private readonly LIMITES_SOURCE_ID = 'limites-seguridad-source';
private readonly LIMITES_FILL_ID = 'limites-seguridad-fill';
private readonly LIMITES_LINE_ID = 'limites-seguridad-line';

/**
 * Coleccion de GeoJSON finalizados recibida desde el componente padre.
 * Permite recuperar los poligonos cuando se inicializa
 * el mapa 3D o se modifica su estilo.
 */
@Input() poligonosLimites: readonly FeaturePoligono[] = [];

  // ======================================================
  // CONFIGURACIÓN
  // ======================================================

  private readonly zone = inject(NgZone);
  private readonly measurementApp = inject(ApplicationRef);
  private readonly measurementInjector = inject(EnvironmentInjector);
  private disposeMeasurementTools?: () => void;
  private readonly measurements = inject(MeasurementService);
  private measurementAdapter?: MapLibreMeasurementAdapter;
  private readonly mapActions = inject(MapActionsService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly mapaElementosService = inject(MapaElementosService);

  private readonly DEFAULT_CENTER: [number, number] = [-74, 10];
  private readonly DEFAULT_ZOOM = 1.8;
  private readonly DEFAULT_MIN_ZOOM = 1;
  private readonly DEFAULT_MAX_ZOOM = 19;
  private readonly DEFAULT_MAX_PITCH = 85;
  private readonly DEFAULT_BEARING = 0;
  private readonly DEFAULT_PITCH = 0;
  private readonly cartography = inject(CartographyConfigService);
  private readonly DEFAULT_BASE_MAP_ID: BaseMapId = this.cartography.resolveSelection();
  private readonly BASE_SOURCE_ID = 'base-map-source';
  private readonly BASE_LAYER_ID = 'base-map-layer';
  private readonly BASE_SOURCE_ID_NEXT = 'base-map-source-next';
  private readonly BASE_LAYER_ID_NEXT = 'base-map-layer-next';
  private readonly BASE_MAP_LOAD_TIMEOUT_MS = 8000;
  private readonly BASE_MAP_BLACK_GAP_CHECK_MS = 100;
  private readonly BASE_MAP_ERROR_FALLBACK_THRESHOLD = 3;
  private readonly DEM_TERRAIN_SOURCE_ID = 'dem-colombia-terrain';
  private readonly DEM_HILLSHADE_SOURCE_ID = 'dem-colombia-hillshade';
  private readonly DEM_TARGET_PITCH = 60;
  private readonly DEM_TARGET_EXAGGERATION = 1;
  private readonly ALTURA_TRAYECTORIA_3D = 5000;
  private trayectoriaRetryTimer: number | null = null;
  private readonly RELACION_SOURCE_ID = 'relacion-fijada-source';
  private readonly TRAYECTORIA_3D_LAYER_ID = 'vulcano-trayectoria-3d';
  private trayectoria3dVertices = new Float32Array();
  private mapaListo = false;
  private trayectoriaRenderDiagnosticLogged = false;
  private trayectoria3dBuffer: WebGLBuffer | null = null;
  private trayectoria3dProgram: WebGLProgram | null = null;
  private trayectoria3dPositionLocation = -1;
  private trayectoria3dMatrixLocation: WebGLUniformLocation | null = null;
  private trayectoria3dOtherLocation = -1;
  private trayectoria3dSideLocation = -1;
  private trayectoria3dViewportLocation: WebGLUniformLocation | null = null;
  private trayectoriaEncuadrada: SimulacionTrayectoriaResponse | null = null;
  private readonly RELACION_LAYER_ID = 'relacion-fijada-layer';
  private readonly DEM_BOUNDS: [number, number, number, number] = [
    -79.00013888888888,
    -5.0004166666666645,
    -65.96402777777777,
    13.00013888888889,
  ];
  private readonly vulcanoApi = inject(VulcanoApiService);

  // ======================================================
  // INPUTS
  // ======================================================

  /**
   * Centro inicial del globo.
   *
   * Orden MapLibre:
   * [longitud, latitud]
   */
  @Input() center: [number, number] = this.DEFAULT_CENTER;

  /**
   * Zoom inicial del globo.
   */
  @Input() zoom: number = this.DEFAULT_ZOOM;

  /**
   * Zoom mínimo permitido.
   */
  @Input() minZoom: number = this.DEFAULT_MIN_ZOOM;

  /**
   * Zoom máximo permitido.
   */
  @Input() maxZoom: number = this.DEFAULT_MAX_ZOOM;

  /**
   * Pitch máximo para permitir una inclinación razonable en el globo.
   */
  @Input() maxPitch: number = this.DEFAULT_MAX_PITCH;

  /**
   * Bearing inicial del globo.
   */
  @Input() bearing: number = this.DEFAULT_BEARING;

  /**
   * Pitch inicial del globo.
   */
  @Input() pitch: number = this.DEFAULT_PITCH;
  @Input() relacionFijada: RelacionFijada | null = null;
  @Input() simulacionTrayectoria: SimulacionTrayectoriaResponse | null = null;
  @Input() registrosCoordenadas: readonly RegistroCoordenada[] = [];
  @Input() puntosCapturaVisual: readonly PuntoCapturaVisual[] = [];
  @Output() mapClick = new EventEmitter<{ lat: number; lng: number }>();

  private readonly marcadoresVistaPrevia = new Map<number, maplibregl.Marker>();

  /** Representacion local del historial compartido; independiente de estilos y capas operativas. */
  private renderVistaPrevia(): void {
    if (!this.map) return;
    const puntos = this.puntosCapturaVisual.filter(validGeographicPoint);
    const ids = new Set(puntos.map(point => point.id));
    for (const [id, marker] of this.marcadoresVistaPrevia) {
      if (!ids.has(id)) {
        marker.remove();
        this.marcadoresVistaPrevia.delete(id);
      }
    }
    for (const point of puntos) {
      const existing = this.marcadoresVistaPrevia.get(point.id);
      if (existing) {
        existing.setLngLat([point.longitud, point.latitud]);
        if (existing.getElement().parentElement !== this.map.getCanvasContainer()) existing.addTo(this.map);
        continue;
      }
      const element = document.createElement('div');
      element.className = 'coordinate-preview-marker-3d';
      element.setAttribute('aria-label', `P${point.id}`);
      element.style.cssText = 'width:14px;height:14px;box-sizing:border-box;border-radius:50%;background:#2879eb;border:2px solid #fff;pointer-events:none';
      const label = document.createElement('span');
      label.textContent = `P${point.id}`;
      label.style.cssText = 'position:absolute;bottom:19px;left:50%;transform:translateX(-50%);padding:2px 5px;background:#14261d;border:1px solid #72966a;border-radius:3px;color:#dce7d0;font:600 11px system-ui,sans-serif;white-space:nowrap;pointer-events:none';
      element.appendChild(label);
      const marker = new maplibregl.Marker({ element, anchor: 'center', pitchAlignment: 'viewport', rotationAlignment: 'viewport' })
        .setLngLat([point.longitud, point.latitud]).addTo(this.map);
      this.marcadoresVistaPrevia.set(point.id, marker);
    }
  }

  // ======================================================
  // OUTPUTS
  // ======================================================

  /**
   * Se emite cuando el mapa termina de cargar.
   */
  @Output() mapReady = new EventEmitter<MapLibreMap>();

  constructor() {
    if (this.DEBUG_MAP) {
      console.log('[MapaTresD LIFE] CONSTRUCTOR');
    }
  }

  ngOnInit(): void {
    if (this.DEBUG_MAP) {
      console.log('[MapaTresD LIFE] INIT');
    }
    this.logDemEnvironmentOnce();
  }

  private captureMemoryMb(): number | null {
    const memory = (performance as Performance & {
      memory?: {
        usedJSHeapSize?: number;
      };
    }).memory;

    return typeof memory?.usedJSHeapSize === 'number'
      ? Math.round(memory.usedJSHeapSize / 1024 / 1024)
      : null;
  }

  private logMapPerformance(stage: string): void {
    if (!this.DEBUG_MAP) {
      return;
    }

    const now = performance.now();
    const mapCreateAt = this.mapPerformance.mapCreateAt || now;

    this.mapPerformance.memoryAfterMb = this.captureMemoryMb();

    console.log('[MAP PERFORMANCE]', {
      stage,
      mapCreateMs: Math.round(now - mapCreateAt),
      styleLoadMs: this.mapPerformance.styleLoadAt ? Math.round(this.mapPerformance.styleLoadAt - mapCreateAt) : null,
      terrainApplyMs: this.mapPerformance.terrainApplyAt ? Math.round(this.mapPerformance.terrainApplyAt - mapCreateAt) : null,
      firstElevationMs: this.mapPerformance.firstElevationAt ? Math.round(this.mapPerformance.firstElevationAt - mapCreateAt) : null,
      idleMs: this.mapPerformance.idleAt ? Math.round(this.mapPerformance.idleAt - mapCreateAt) : null,
      memoryBeforeMb: this.mapPerformance.memoryBeforeMb,
      memoryAfterMb: this.mapPerformance.memoryAfterMb,
      terrainSource: this.map?.getTerrain()?.source ?? null,
      pitch: this.map?.getPitch?.() ?? null,
      zoom: this.map?.getZoom?.() ?? null,
    });
  }

  private scheduleResize(reason: string): void {
    if (!this.map) {
      return;
    }

    if (this.resizeDebounceTimerId !== null) {
      window.clearTimeout(this.resizeDebounceTimerId);
    }

    this.resizeDebounceTimerId = window.setTimeout(() => {
      this.resizeDebounceTimerId = null;
      this.resizeMapIfNeeded(reason);
    }, this.MAP_RESIZE_DEBOUNCE_MS);
  }

  private registerIdlePerformanceProbe(): void {
    if (!this.map || this.mapIdlePerformanceRegistered) {
      return;
    }

    this.mapIdlePerformanceRegistered = true;

    this.map.once('idle', () => {
      this.mapIdlePerformanceRegistered = false;
      this.mapPerformance.idleAt = performance.now();
      this.logMapPerformance('idle');
    });
  }

  private logDemEnvironmentOnce(): void {
    if (this.demEnvironmentLogged) {
      return;
    }

    if (!this.DEBUG_MAP) {
      this.demEnvironmentLogged = true;
      return;
    }

    this.demEnvironmentLogged = true;

    console.log('[DEM ENVIRONMENT]', {
      production: environment.production,
      demApiUrl: this.vulcanoApi.baseUrl,
    });

    console.log('[DEM TILE URL]', this.vulcanoApi.tilesUrl);
  }

  // ======================================================
  // REFERENCIAS DOM
  // ======================================================

  @ViewChild('mapContainer', { static: true })
  private readonly mapContainer!: ElementRef<HTMLDivElement>;

  @ViewChild('terrainBaselineContainer')
  private readonly terrainBaselineContainer?: ElementRef<HTMLDivElement>;

  // ======================================================
  // MAPLIBRE
  // ======================================================

  private map: MapLibreMap | null = null;
  private mapLoadTimeoutId: number | null = null;
  private baselineMap: MapLibreMap | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private resizeRafId = 0;
  loading = true;
  mapError: string | null = null;
  private activeBaseMapId: BaseMapId = this.DEFAULT_BASE_MAP_ID;
  private requestedBaseMapId: BaseMapId | null = null;
  private mapaBaseActual: BaseMapId | null = null;
  private activeBaseMapSourceId = this.BASE_SOURCE_ID;
  private activeBaseMapLayerId = this.BASE_LAYER_ID;
  private baseMapControl: BaseMapControl | null = null;
  private pendingBaseMapChange: PendingBaseMapChange | null = null;
  private baseMapFallbackInProgress = false;
  private baseMapChangeSequence = 0;
  private baseMapTileErrorCount = 0;
  private baseMapTileErrorProvider: BaseMapId | null = null;
  private demVerificationInProgress = false;
  private demVerified = false;
  private demAvailable = false;
  private terrainIdleProbeRegistered = false;
  private vista3DActiva = false;
  private terrainDiagnosticMode = false;
  private readonly AUTO_RUN_TERRAIN_DIAGNOSTIC = false;
  private terrainDiagnosticAlreadyExecuted = false;
  baselineDiagnosticRunning = false;
  baselineDiagnosticVisible = false;
  baselineDiagnosticCurrentStage = 'Baseline pendiente.';
  baselineDiagnosticProgress = 0;
  baselineDiagnosticFinished = false;
  baselineDiagnosticResults: DemDiagnosticResult[] = [];
  baselineDiagnosticText = '';
  baselineDiagnosticConclusion = '';
  baselineDiagnosticErrors: string[] = [];
  baselineSourceEvents: Array<{
    sourceId?: string;
    sourceDataType?: string;
    isSourceLoaded?: boolean;
  }> = [];
  private lastMapWidth = 0;
  private lastMapHeight = 0;
  private resizeScheduled = false;
  private diagnosticSourceDataCount = 0;
  diagnosticRunning = false;
  demDebugVisible = false;
  demDiagnosticCurrentStage = 'Diagnostico en ejecucion.';
  demDiagnosticProgress = 0;
  demDiagnosticFinished = false;
  demDiagnosticResults: DemDiagnosticResult[] = [];
  demDiagnosticText = '';
  demDiagnosticConclusion = '';
  diagnosticErrors: string[] = [];
  private readonly DEM_CONTROL_SOURCE_ID = 'terrain-control';
  private readonly DEM_LOCAL_TEST_SOURCE_ID = 'dem-local-test';
  private readonly DEM_REQUEST_LOG_LIMIT = 30;
  private readonly DEM_MAX_REAL_TILE_CHECKS = 10;
  private readonly DEM_HILLSHADE_LAYER_ID = 'dem-hillshade-test';
  private demActivationPending = false;
  private demActivationInProgress = false;
  private demCameraDiagnosticApplied = false;
  private styleInitialized = false;
  private demConfigured = false;
  private demLoadTestActive = false;
  private demEnvironmentLogged = false;
  private readonly DEBUG_MAP = !environment.production;
  private readonly MAP_RESIZE_DEBOUNCE_MS = 120;
  private readonly MAP_MAX_TILE_CACHE_ZOOM_LEVELS = 3;
  private terrainCameraPresetApplied = false;
  private demRequestLogCount = 0;
  private firstDemTileUrl: string | null = null;
  private firstDemTileHttpStatus: number | null = null;
  private firstDemTileBlobSize: number | null = null;
  private firstDemTileContentType: string | null = null;
  private firstDemTileBrowserMin: number | null = null;
  private firstDemTileBrowserMax: number | null = null;
  private firstDemTileBrowserMean: number | null = null;
  private firstDemTileAlphaMin: number | null = null;
  private firstDemTileAlphaMax: number | null = null;
  private firstDemTileEncoding: string | null = null;
  private demLoadTestTimerId: number | null = null;
  private demLoadFinalSummaryTimerId: number | null = null;
  private demMapErrors: Array<Record<string, unknown>> = [];
  private demRequestedTiles: string[] = [];
  private demRequestedTileSet = new Set<string>();
  private demRealTileChecks: DemRealTileCheck[] = [];
  private demRealTileCheckSet = new Set<string>();
  private demTerrariumComparisonSourceId = this.DEM_TERRAIN_SOURCE_ID;
  private terrainCheckpointTimerIds: number[] = [];
  private resizeDebounceTimerId: number | null = null;
  private mapIdlePerformanceRegistered = false;
  private readonly mapPerformance = {
    mapCreateAt: 0,
    styleLoadAt: 0,
    terrainApplyAt: 0,
    firstElevationAt: 0,
    idleAt: 0,
    memoryBeforeMb: null as number | null,
    memoryAfterMb: null as number | null,
  };
  private readonly elementoMarkers = new Map<string, maplibregl.Marker>();
  private readonly registroMarkers = new Map<string, maplibregl.Marker>();
  private suppressInitialElementFocus = true;

  // ======================================================
  // MAPAS BASE
  // ======================================================

  /**
   * Catalogo compartido definido por CARTOGRAPHY_CONFIG / CartographyConfigService.
   *
   * Esta estructura está preparada para crecer con cartografía propia,
   * satélite, topografía o estilos institucionales sin cambiar la lógica
   * principal del mapa.
   */
  private readonly baseMaps: Record<BaseMapId, BaseMapConfig> = inject(CartographyConfigService).mapLibreLayers();

  // ======================================================
  // INICIALIZACIÓN
  // ======================================================

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      this.initializeMap();
      this.observeResize();
      this.subscribeToElementos();
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.map) {
      return;
    }
    if (changes['puntosGeograficos']) this.puntosLayer.sync(this.map, this.puntosGeograficos);
    if (changes['puntosCapturaVisual']) this.renderVistaPrevia();
  // Actualiza el GeoJSON cuando cambia desde VULCANO.
  if (changes['poligonosLimites']) {
    this.sincronizarLimitesSeguridad(true);
  }
    if (this.terrainDiagnosticMode) {
      this.logPitch('ngOnChanges:diagnostic-ignored');
      return;
    }

    this.logPitch('ngOnChanges:before');

    const jumpOptions: maplibregl.JumpToOptions = {};

    if (changes['center'] || changes['zoom']) {
      jumpOptions.center = this.center;
      jumpOptions.zoom = this.zoom;
    }

    if (changes['minZoom']) {
      this.map.setMinZoom(this.minZoom);
    }

    if (changes['maxZoom']) {
      this.map.setMaxZoom(this.maxZoom);
    }

    if (changes['maxPitch']) {
      this.map.setMaxPitch(this.maxPitch);
    }

    if (changes['bearing']) {
      jumpOptions.bearing = this.bearing;
    }

    if (changes['pitch'] && !this.vista3DActiva) {
      jumpOptions.pitch = this.pitch;
    }

    if (Object.keys(jumpOptions).length > 0) {
      this.map.jumpTo(jumpOptions);
    }

    if (changes['registrosCoordenadas']) this.sincronizarRegistrosCoordenadas();
    if (changes['relacionFijada'] || changes['simulacionTrayectoria']) this.sincronizarTrayectoria3D();

    this.logPitch('ngOnChanges:after');
  }

  // ======================================================
  // GLOBO
  // ======================================================

  /**
   * Inicializa MapLibre dentro del contenedor.
   */
  private initializeMap(): void {
    if (this.map) {
      return;
    }
    console.log('[LOADER] ON - MAPA 3D');

    if (!this.hasWebGLSupport()) {
      this.mapError = 'No fue posible inicializar el mapa 3D: WebGL no está disponible en este navegador.';
      this.loading = false;
      console.error(this.mapError);
      return;
    }

    this.logWebGlInfo();

    const container = this.mapContainer.nativeElement;
    this.mapPerformance.mapCreateAt = performance.now();
    this.mapPerformance.memoryBeforeMb = this.captureMemoryMb();
    this.logMapPerformance('map-create');

    try {
      const mapOptions: maplibregl.MapOptions = {
        container,
        style: this.createStyle(),
        center: this.center,
        zoom: this.zoom,
        minZoom: this.minZoom,
        maxZoom: this.maxZoom,
        pitch: this.pitch,
        bearing: this.bearing,
        maxPitch: this.maxPitch,
        validateStyle: this.DEBUG_MAP,
        maxTileCacheZoomLevels: this.MAP_MAX_TILE_CACHE_ZOOM_LEVELS,
        canvasContextAttributes: {
          antialias: true,
          preserveDrawingBuffer: true,
        },
      };

      if (this.DEBUG_MAP) {
        mapOptions.transformRequest = this.transformMapRequest;
      }

      this.map = new maplibregl.Map(mapOptions);
      this.mapLoadTimeoutId = window.setTimeout(() => {
        if (!this.loading) return;
        this.zone.run(() => {
          this.loading = false;
          this.mapError = 'Tiempo de espera agotado al cargar el mapa 3D.';
          console.log('[LOADER] OFF - MAPA 3D (timeout)');
        });
      }, 30_000);
    } catch (error) {
      this.mapError = 'No fue posible inicializar el mapa 3D.';
      this.loading = false;
      console.error(this.mapError, error);
      return;
    }

    this.bindMapEvents();
    this.renderVistaPrevia();
    this.addControls();
    this.disposeMeasurementTools = attachMeasurementTools(container, this.measurementApp, this.measurementInjector, true);
    this.measurementAdapter = new MapLibreMeasurementAdapter(this.map!, this.measurements);
    this.map.on('load', this.handleMapLoad);
    this.map.on('error', this.handleMapError);
  }

  private createStyle(): StyleSpecification {
    this.activeBaseMapId = this.cartography.resolveSelection(this.activeBaseMapId);
    return {
      version: 8,
      name: 'MapaTresD',
      sources: {
        [this.activeBaseMapSourceId]: {
          ...this.createBaseMapSourceSpecification(this.activeBaseMapId),
        },
      },
      layers: [
        {
          id: this.activeBaseMapLayerId,
          type: 'raster',
          source: this.activeBaseMapSourceId,
        },
      ],
    };
  }

  private logStyleState(origin: string): void {
    if (!this.map || !this.DEBUG_MAP) {
      return;
    }

    console.log('[STYLE STATE]', origin, {
      loaded: this.map.loaded(),
      styleLoaded: this.map.isStyleLoaded(),
      styleExists: !!this.map.getStyle(),
      sourceCount: Object.keys(this.map.getStyle()?.sources ?? {}).length,
      layerCount: this.map.getStyle()?.layers?.length ?? 0,
      baseMap: this.mapaBaseActual,
      pendingBaseMapChange: !!this.pendingBaseMapChange,
    });
  }

  private bindMapEvents(): void {
    if (!this.map) {
      return;
    }

    this.map.on('style.load', this.handleStyleLoad);
    this.map.on('styledataloading', this.handlePuntosStyleLoading);
    this.map.on('click', this.handleMapClick);
    this.map.on('sourcedata', this.handleSourceData);
    this.map.on('contextmenu', this.handleMapContextMenu);
    for (const type of ['movestart', 'zoomstart', 'rotatestart']) this.map.on(type, this.closeMapContextMenu);
  }

  /** Usa el picking de superficie de MapLibre con terrain y descarta cielo u horizontes sin interseccion. */
  private readonly handleMapClick = (event: maplibregl.MapMouseEvent): void => {
    if (!this.map || event.defaultPrevented || !mapActionTarget(event.originalEvent.target)) return;
    if (!Number.isFinite(event.point.x) || !Number.isFinite(event.point.y)) return;
    if (!this.map.transform.isPointOnMapSurface(event.point, this.map.terrain)) return;
    const coordinate = this.map.unproject(event.point);
    const point = Math.abs(coordinate.lng) <= 180 ? coordinate : coordinate.wrap();
    if (!validGeographicPoint({ latitud: point.lat, longitud: point.lng })) return;
    this.zone.run(() => this.mapClick.emit({ lat: point.lat, lng: point.lng }));
  };

  /** Usa el picking existente tambien para el menu contextual. */
  private readonly handleMapContextMenu = (event: maplibregl.MapMouseEvent): void => {
    if (!this.map || event.defaultPrevented || !mapActionTarget(event.originalEvent.target)) return;
    if (!Number.isFinite(event.point.x) || !Number.isFinite(event.point.y)) return;
    if (!this.map.transform.isPointOnMapSurface(event.point, this.map.terrain)) return;
    const coordinate = this.map.unproject(event.point);
    const point = Math.abs(coordinate.lng) <= 180 ? coordinate : coordinate.wrap();
    this.mapActions.open(this.map.getContainer(), { latitud: point.lat, longitud: point.lng }, event.originalEvent);
  };

  /** Cierra el menu de este visor al cambiar la camara, sin intervenir en sus controles. */
  private readonly closeMapContextMenu = (): void => {
    if (this.map) this.mapActions.closeFor(this.map.getContainer());
  };

  private addControls(): void {
    if (!this.map) {
      return;
    }

    this.map.addControl(
      new maplibregl.NavigationControl({
        showCompass: true,
        showZoom: true,
        visualizePitch: true,
      }),
      'top-right',
    );

    this.map.addControl(
      new maplibregl.ScaleControl({
        maxWidth: 120,
        unit: 'metric',
      }),
      'bottom-left',
    );

    this.baseMapControl = new BaseMapControl(
      this.baseMaps,
      this.activeBaseMapId,
      (baseMapId) => this.changeBaseMap(baseMapId),
    );

    this.map.addControl(this.baseMapControl, 'top-right');
  }

  private createBaseMapSourceSpecification(baseMapId: BaseMapId): {
    type: 'raster';
    tiles: string[];
    tileSize: number;
    minzoom?: number;
    maxzoom?: number;
    attribution?: string;
    bounds?: [number, number, number, number];
  } {
    const config = this.baseMaps[this.cartography.resolveSelection(baseMapId)];
    const tiles = config.tiles ?? [];

    console.log('[BASE TILE URL]', {
      id: config.id,
      provider: config.provider,
      tiles,
      tileSize: config.tileSize ?? 256,
      maxzoom: config.maxZoom ?? null,
    });

    return {
      type: 'raster',
      tiles,
      tileSize: config.tileSize ?? 256,
      minzoom: config.minZoom,
      maxzoom: config.maxZoom,
      attribution: config.attribution,
      bounds: config.bounds,
    };
  }

  private logBaseMapStatus(origin: string): void {
    if (!this.map) {
      return;
    }

    const config = this.baseMaps[this.activeBaseMapId];

    console.log('[BASE MAP STATUS]', {
      origin,
      id: config.id,
      provider: config.provider,
      tileURL: config.tiles?.[0] ?? null,
      tileSize: config.tileSize ?? 256,
      maxzoom: config.maxZoom ?? null,
      currentZoom: this.map.getZoom(),
      terrainActive: !!this.map.getTerrain(),
    });
  }

  private readonly handleStyleLoad = (): void => {
    if (!this.map) {
      return;
    }
    this.puntosLayer.sync(this.map, this.puntosGeograficos, true);
    this.renderVistaPrevia();

    this.styleInitialized = true;
    this.mapPerformance.styleLoadAt = performance.now();
    this.logMapPerformance('style-load');
    if (this.DEBUG_MAP) {
      console.count('[COUNT] style.load');
      console.log('[STYLE LOAD]', {
        styleInitialized: this.styleInitialized,
        isStyleLoaded: this.map.isStyleLoaded(),
        styleExists: !!this.map.getStyle(),
      });
    }
    this.logStyleState('style.load');

    if (this.terrainDiagnosticMode) {
      if (this.DEBUG_MAP) {
        console.log('[DEM DIAG] style.load auto DEM suppressed.');
      }
      return;
    }

    this.map.setProjection({
      type: 'mercator',
    });
this.sincronizarLimitesSeguridad();
    if (this.vista3DActiva || this.demActivationPending) {
      requestAnimationFrame(() => {
        this.configurarDem();
      });
    }
    this.sincronizarTrayectoria3D();
    this.map.once('idle', () => this.sincronizarTrayectoria3D());
  };

  private readonly handleMapLoad = (): void => {
    if (this.mapLoadTimeoutId !== null) {
      window.clearTimeout(this.mapLoadTimeoutId);
      this.mapLoadTimeoutId = null;
    }
    if (!this.map) {
      return;
    }
    this.puntosLayer.sync(this.map, this.puntosGeograficos, true);

this.styleInitialized = true;
this.mapaListo = true;

// Recupera el polígono si llegó antes de cargar MapLibre.
this.sincronizarLimitesSeguridad();

// Sincroniza los registros existentes.
this.sincronizarRegistrosCoordenadas();
    console.log('[APOGEO-3D][MAP READY]', this.map !== undefined);
    this.zone.run(() => {
      this.loading = false;
      console.log('[LOADER] OFF - MAPA 3D');
      this.mapError = null;
      this.mapReady.emit(this.map!);
    });

    this.logMapCanvasInfo('[MAP SIZE AFTER LOAD]');
    this.logStyleState('load');
    if (this.DEBUG_MAP) {
      console.log('[STYLE READY]', {
        loaded: this.map.loaded(),
        styleLoaded: this.map.isStyleLoaded(),
        sources: Object.keys(this.map.getStyle()?.sources ?? {}),
        layers: this.map.getStyle()?.layers?.map((layer) => layer.id) ?? [],
      });
    }
    this.mapaBaseActual = this.activeBaseMapId;
    this.baseMapControl?.setActiveBaseMap(this.activeBaseMapId);
    this.logBaseMapStatus('load');

    if (this.terrainDiagnosticMode) {
      if (this.DEBUG_MAP) {
        console.log('[DEM DIAG] map.load auto terrain/base-map suppressed.');
      }
      return;
    }

    this.configurarDem();
    this.sincronizarTrayectoria3D();
    this.map.once('idle', () => this.sincronizarTrayectoria3D());
  };

  private sincronizarTrayectoria3D(): void {
    const relacion = this.relacionFijada;
    const simulacion = this.simulacionTrayectoria;
    console.log('[TRAYECTORIA 3D] input recibido', {
      relacion: !!relacion,
      simulacion: !!simulacion,
      map: !!this.map,
      styleLoaded: this.map?.isStyleLoaded(),
    });
    if (!simulacion) {
      this.eliminarTrayectoria3d();
      return;
    }
    if (!this.map || !this.mapaListo || !this.map.isStyleLoaded()) {
      return;
    }
    console.log('[APOGEO-3D][INPUT]', simulacion);
    const coordinates = construirTrayectoria3D(simulacion);
    console.log('[3D-TRACE][DATA]', { p1: simulacion.p1, apogeo: simulacion.apogeo, p2: simulacion.p2 });
    console.log('[TRAYECTORIA 3D DATA]', {
      distancia: simulacion.distancia_m,
      elevacionP1: simulacion.p1?.elevacion_msnm,
      elevacionP2: simulacion.p2?.elevacion_msnm,
      apogeo: simulacion.apogeo?.altitud_visual_msnm,
      distanciaApogeo: (simulacion.apogeo as typeof simulacion.apogeo & { distancia_m?: number })?.distancia_m,
    });
    if (coordinates.length < 3) {
      this.eliminarTrayectoria3d();
      console.warn('[FIJAR] Relación descartada por coordenadas inválidas');
      return;
    }
    const points: number[][] = [];
    for (const [lng, lat, altitude] of coordinates) {
      const mercator = maplibregl.MercatorCoordinate.fromLngLat({ lng, lat }, altitude);
      points.push([mercator.x, mercator.y, mercator.z]);
    }
    const vertices: number[] = [];
    // Two screen-width triangles per segment avoid platform-dependent WebGL line widths.
    for (let i = 1; i < points.length; i++) {
      const a = points[i - 1];
      const b = points[i];
      vertices.push(...a, ...b, -1, ...a, ...b, 1, ...b, ...a, 1,
        ...a, ...b, 1, ...b, ...a, -1, ...b, ...a, 1);
    }
    if (vertices.some(value => !Number.isFinite(value))) return;
    this.trayectoria3dVertices = new Float32Array(vertices);
    console.log('[TRAYECTORIA 3D] puntos generados', coordinates.length);
    console.log('[3D-TRACE][VERTICES]', {
      cantidad: this.trayectoria3dVertices.length / 7,
      primeros: Array.from(this.trayectoria3dVertices.slice(0, 9)),
      ultimos: Array.from(this.trayectoria3dVertices.slice(Math.max(0, this.trayectoria3dVertices.length - 9))),
    });
    if (this.trayectoria3dVertices.length < 6 || !Array.from(this.trayectoria3dVertices).every(Number.isFinite)) {
      console.error('[TRAYECTORIA 3D] vértices inválidos');
      return;
    }
    this.instalarTrayectoria3d();
    if (this.vista3DActiva && this.trayectoriaEncuadrada !== simulacion) {
      const bounds = new maplibregl.LngLatBounds();
      coordinates.forEach(([lon, lat]) => bounds.extend([lon, lat]));
      this.map.fitBounds(bounds, { padding: 48, maxZoom: 15, duration: 500 });
      this.trayectoriaEncuadrada = simulacion;
    }
    this.map.triggerRepaint();
  }

  private eliminarTrayectoria3d(): void {
    this.trayectoria3dVertices = new Float32Array();
    this.trayectoriaEncuadrada = null;
    if (!this.map) return;
    if (this.map.getLayer(this.TRAYECTORIA_3D_LAYER_ID)) {
      this.map.removeLayer(this.TRAYECTORIA_3D_LAYER_ID);
    }
    this.trayectoria3dVertices = new Float32Array();
  }

  private instalarTrayectoria3d(): void {
    if (!this.map || !this.map.isStyleLoaded()) return;
    if (!this.map.getLayer(this.TRAYECTORIA_3D_LAYER_ID)) {
      this.map.addLayer({
        id: this.TRAYECTORIA_3D_LAYER_ID,
        type: 'custom',
        renderingMode: '3d',
        onAdd: (map, gl) => this.inicializarTrayectoria3d(gl),
        render: (gl, { defaultProjectionData }) => this.renderizarTrayectoria3d(gl, defaultProjectionData.mainMatrix as unknown as Float32List),
        onRemove: (_map, gl) => this.destruirTrayectoria3d(gl),
      } as maplibregl.CustomLayerInterface);
      console.log('[TRAYECTORIA 3D] geometría agregada', this.TRAYECTORIA_3D_LAYER_ID);
      console.log('[3D-TRACE][LAYER]', {
        exists: !!this.map.getLayer(this.TRAYECTORIA_3D_LAYER_ID),
        id: this.TRAYECTORIA_3D_LAYER_ID,
      });
    } else {
      this.map.triggerRepaint();
    }
  }

  private inicializarTrayectoria3d(gl: WebGLRenderingContext): void {
    console.log('[3D-TRACE][ONADD]');
    const vertexShader = gl.createShader(gl.VERTEX_SHADER);
    const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);
    if (!vertexShader || !fragmentShader) return;
    gl.shaderSource(vertexShader, `
      attribute vec3 a_pos;
      attribute vec3 a_other;
      attribute float a_side;
      uniform mat4 u_matrix;
      uniform vec2 u_viewport;
      void main() {
        vec4 position = u_matrix * vec4(a_pos, 1.0);
        vec4 other = u_matrix * vec4(a_other, 1.0);
        vec2 direction = (other.xy / other.w - position.xy / position.w) * u_viewport;
        float magnitude = max(length(direction), 0.00001);
        vec2 normal = vec2(-direction.y, direction.x) / magnitude;
        position.xy += normal * a_side * 4.0 / u_viewport * position.w;
        gl_Position = position;
      }`);
    gl.shaderSource(fragmentShader, 'precision mediump float; void main(){ gl_FragColor = vec4(1.0, 0.1, 0.1, 0.95); }');
    gl.compileShader(vertexShader);
    gl.compileShader(fragmentShader);
    if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS) || !gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
      console.error('[TRAYECTORIA-3D][SHADER]', gl.getShaderInfoLog(vertexShader), gl.getShaderInfoLog(fragmentShader));
      gl.deleteShader(vertexShader);
      gl.deleteShader(fragmentShader);
      return;
    }
    const program = gl.createProgram();
    if (!program) return;
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    gl.deleteShader(vertexShader);
    gl.deleteShader(fragmentShader);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[TRAYECTORIA-3D][PROGRAM]', gl.getProgramInfoLog(program));
      gl.deleteProgram(program);
      return;
    }
    this.trayectoria3dProgram = program;
    this.trayectoria3dPositionLocation = gl.getAttribLocation(program, 'a_pos');
    this.trayectoria3dMatrixLocation = gl.getUniformLocation(program, 'u_matrix');
    this.trayectoria3dOtherLocation = gl.getAttribLocation(program, 'a_other');
    this.trayectoria3dSideLocation = gl.getAttribLocation(program, 'a_side');
    this.trayectoria3dViewportLocation = gl.getUniformLocation(program, 'u_viewport');
    this.trayectoria3dBuffer = gl.createBuffer();
    console.log('[TRAYECTORIA-3D][VERIFY]', {
      layer: !!this.map?.getLayer(this.TRAYECTORIA_3D_LAYER_ID),
      vertices: this.trayectoria3dVertices.length,
      program: !!this.trayectoria3dProgram,
      buffer: !!this.trayectoria3dBuffer,
      position: this.trayectoria3dPositionLocation,
      matrix: !!this.trayectoria3dMatrixLocation,
    });
    console.log('[3D-TRACE][WEBGL]', {
      program: !!this.trayectoria3dProgram,
      buffer: !!this.trayectoria3dBuffer,
      positionLocation: this.trayectoria3dPositionLocation,
      matrixLocation: !!this.trayectoria3dMatrixLocation,
    });
  }

  private renderizarTrayectoria3d(gl: WebGLRenderingContext | WebGL2RenderingContext, matrix: Float32List): void {
    if (!this.trayectoria3dProgram || !this.trayectoria3dBuffer || this.trayectoria3dVertices.length < 6) return;
    if (!this.trayectoriaRenderDiagnosticLogged) {
      console.log('[3D-TRACE][RENDER]', {
        vertices: this.trayectoria3dVertices.length / 7,
        program: !!this.trayectoria3dProgram,
        buffer: !!this.trayectoria3dBuffer,
      });
      console.log('[3D-TRACE][LINE WIDTH RANGE]', gl.getParameter(gl.ALIASED_LINE_WIDTH_RANGE));
      this.trayectoriaRenderDiagnosticLogged = true;
    }
    gl.useProgram(this.trayectoria3dProgram);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.trayectoria3dBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.trayectoria3dVertices, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(this.trayectoria3dPositionLocation);
    gl.vertexAttribPointer(this.trayectoria3dPositionLocation, 3, gl.FLOAT, false, 28, 0);
    gl.enableVertexAttribArray(this.trayectoria3dOtherLocation);
    gl.vertexAttribPointer(this.trayectoria3dOtherLocation, 3, gl.FLOAT, false, 28, 12);
    gl.enableVertexAttribArray(this.trayectoria3dSideLocation);
    gl.vertexAttribPointer(this.trayectoria3dSideLocation, 1, gl.FLOAT, false, 28, 24);
    gl.uniform2f(this.trayectoria3dViewportLocation, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.uniformMatrix4fv(this.trayectoria3dMatrixLocation, false, matrix);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(false);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.CULL_FACE);
    gl.drawArrays(gl.TRIANGLES, 0, this.trayectoria3dVertices.length / 7);
  }

  private destruirTrayectoria3d(gl: WebGLRenderingContext): void {
    if (this.trayectoria3dBuffer) gl.deleteBuffer(this.trayectoria3dBuffer);
    if (this.trayectoria3dProgram) gl.deleteProgram(this.trayectoria3dProgram);
    this.trayectoria3dBuffer = null;
    this.trayectoria3dProgram = null;
  }

  private readonly handleMapError = (event: unknown): void => {
    const error = this.extractErrorDetail(event);

    console.error('[MAPLIBRE ERROR FULL]', event);
    console.error('[MapaTresD] MapLibre:', error);

    const demError = this.extractDemMapErrorContext(event, error);
    if (this.isDemManagedSourceId(demError.sourceId) || demError.url?.includes('/dem/tiles/')) {
      this.demMapErrors.push(demError);
      console.error('[DEM MAPLIBRE ERROR]', demError);
    }

    const baseMapError = this.extractBaseMapTileErrorContext(event, error);
    const isBaseMapError =
      baseMapError.sourceId === this.BASE_SOURCE_ID ||
      baseMapError.sourceId === this.BASE_SOURCE_ID_NEXT ||
      baseMapError.sourceId === this.activeBaseMapSourceId ||
      baseMapError.sourceId === this.pendingBaseMapChange?.sourceId ||
      (!!baseMapError.url && this.isBaseMapTileUrl(baseMapError.url));

    if (isBaseMapError) {
      const provider = this.pendingBaseMapChange?.baseMapId ?? this.activeBaseMapId;
      if (this.baseMapTileErrorProvider !== provider) {
        this.baseMapTileErrorProvider = provider;
        this.baseMapTileErrorCount = 0;
      }

      this.baseMapTileErrorCount += 1;
      console.error('[BASE MAP TILE ERROR]', {
        sourceId: baseMapError.sourceId,
        tile: baseMapError.tile,
        url: baseMapError.url,
        message: baseMapError.message,
        status: baseMapError.status,
        provider,
        count: this.baseMapTileErrorCount,
      });

      this.failPendingBaseMapChange(baseMapError.message ?? baseMapError.url ?? 'Base map tile error');
      return;
    }

    if (this.terrainDiagnosticMode) {
      this.recordDiagnosticError(error);
    }

    if (this.pendingBaseMapChange) {
      this.failPendingBaseMapChange(error);
      return;
    }

    if (this.loading && !this.hasActiveBaseMapLayer()) {
      this.zone.run(() => {
        this.mapError = this.formatMapErrorMessage(error);
        this.loading = false;
      });
    }
  };

  private readonly handleSourceData = (event: { sourceId?: string; isSourceLoaded?: boolean }): void => {
    if (!this.DEBUG_MAP && !this.pendingBaseMapChange) {
      return;
    }

    if (this.terrainDiagnosticMode && this.isDemManagedSourceId(event.sourceId)) {
      if (this.diagnosticSourceDataCount < 20) {
        this.diagnosticSourceDataCount += 1;
        const source = event.sourceId ? this.map?.getSource(event.sourceId) : null;
        console.log('[DEM DIAG][sourcedata]', {
          sourceId: event.sourceId,
          sourceDataType: (event as { sourceDataType?: string }).sourceDataType ?? null,
          isSourceLoaded: event.isSourceLoaded,
          sourceLoaded: event.sourceId ? this.safeIsSourceLoaded(event.sourceId) : null,
          sourceSerialized: source?.serialize?.() ?? null,
        });
      }
    } else if (this.isDemManagedSourceId(event.sourceId)) {
      const source = event.sourceId ? this.map?.getSource(event.sourceId) : null;
      if (this.DEBUG_MAP) {
        console.log('[DEM SOURCE DATA]', {
          sourceId: event.sourceId,
          sourceDataType: (event as { sourceDataType?: string }).sourceDataType ?? null,
          isSourceLoaded: event.isSourceLoaded,
          sourceLoaded: event.sourceId ? this.safeIsSourceLoaded(event.sourceId) : null,
          sourceSerialized: source?.serialize?.() ?? null,
        });
      }
    }

    if (event.sourceId === this.activeBaseMapSourceId && event.isSourceLoaded) {
      this.baseMapTileErrorCount = 0;
      this.baseMapTileErrorProvider = this.activeBaseMapId;
    }

    const pending = this.pendingBaseMapChange;

    if (!pending) {
      return;
    }

    if (event.sourceId !== pending.sourceId || !event.isSourceLoaded) {
      return;
    }

    this.completePendingBaseMapChange(pending.token);
  };

  /**
   * Fuerza a MapLibre a volver a la vista inicial del globo.
   */
  public resetGlobeView(): void {
    this.flyTo(this.DEFAULT_CENTER[0], this.DEFAULT_CENTER[1], this.DEFAULT_ZOOM);

    this.map?.jumpTo({
      pitch: this.DEFAULT_PITCH,
      bearing: this.DEFAULT_BEARING,
    });
  }

  /**
   * Mueve la cámara del globo a una coordenada específica.
   */
  public flyTo(longitude: number, latitude: number, zoom = 10): void {
    this.map?.flyTo({
      center: [longitude, latitude],
      zoom,
    });
  }

  public obtenerEstadoCamara(): { lat: number; lng: number; zoom: number; bearing: number; pitch: number } | null {
    if (!this.map) {
      return null;
    }

    const center = this.map.getCenter();

    return {
      lat: center.lat,
      lng: center.lng,
      zoom: this.map.getZoom(),
      bearing: this.map.getBearing(),
      pitch: this.map.getPitch(),
    };
  }

  public async capturarParaInforme(): Promise<string> {
    if (!this.map) throw new Error('El mapa 3D no está disponible para el informe.');
    this.map.resize();
    this.map.triggerRepaint();
    await new Promise<void>(resolve => this.map!.once('idle', () => resolve()));
    const canvas = this.map.getCanvas();
    if (!canvas.width || !canvas.height) throw new Error('El mapa 3D no tiene dimensiones para capturar.');
    const copia = document.createElement('canvas');
    copia.width = canvas.width;
    copia.height = canvas.height;
    const context = copia.getContext('2d');
    if (!context) throw new Error('No fue posible leer el mapa 3D.');
    context.drawImage(canvas, 0, 0);
    const containerBounds = this.mapContainer.nativeElement.getBoundingClientRect();
    const scaleX = copia.width / containerBounds.width;
    const scaleY = copia.height / containerBounds.height;
    const markerImages = Array.from(this.mapContainer.nativeElement.querySelectorAll<HTMLImageElement>('.maplibregl-marker img'));
    await Promise.all(markerImages.map(async marker => {
      const image = await this.cargarImagenParaInforme(marker.currentSrc || marker.src);
      const bounds = marker.getBoundingClientRect();
      context.drawImage(image, (bounds.left - containerBounds.left) * scaleX, (bounds.top - containerBounds.top) * scaleY, bounds.width * scaleX, bounds.height * scaleY);
    }));
    context.font = `${12 * scaleX}px Arial`;
    context.fillStyle = '#ffffff';
    context.strokeStyle = '#111111';
    context.lineWidth = Math.max(1, scaleX);
    for (const registro of this.registrosCoordenadas) {
      const lat = Number(registro.latitud);
      const lng = Number(registro.longitud);
      if (!registro.nombre || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      const point = this.map.project([lng, lat]);
      const x = (point.x + 24) * scaleX;
      const y = (point.y - 12) * scaleY;
      context.strokeText(registro.nombre, x, y);
      context.fillText(registro.nombre, x, y);
    }
    console.log('[INFORME][3D] puntos incluidos:', this.registrosCoordenadas.length, { marcadoresDom: markerImages.length });
    const { data } = context.getImageData(0, 0, copia.width, copia.height);
    let pixelesVisibles = 0;
    for (let index = 0; index < data.length; index += 16) {
      if (data[index + 3] > 0 && data[index] + data[index + 1] + data[index + 2] > 24) pixelesVisibles++;
    }
    if (pixelesVisibles < 12) throw new Error('La captura mapa 3D no contiene representación gráfica válida.');
    const captura = copia.toDataURL('image/png');
    console.log('[INFORME] mapa3D capturado:', { width: copia.width, height: copia.height, bytes: captura.length });
    return captura;
  }

  private cargarImagenParaInforme(source: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`No fue posible cargar un icono 3D: ${source}`));
      image.src = source;
    });
  }

  /**
   * Permite cambiar el mapa base sin recrear el componente Angular.
   * La lógica principal seguirá viviendo dentro de MapaTresD.
   */
  public changeBaseMap(baseMapId: BaseMapId): void {
    // Protege tambien llamadas programaticas: una opcion deshabilitada no cambia capas ni camara.
    if (!this.cartography.isEnabled(baseMapId)) return;
    const config = this.baseMaps[baseMapId];

    if (!this.map) {
      return;
    }

    if (this.terrainDiagnosticMode) {
      if (this.DEBUG_MAP) {
        console.log('[DEM DIAG] changeBaseMap suppressed during terrain diagnostics:', baseMapId);
      }
      return;
    }

    this.logStyleState(`changeBaseMap:${baseMapId}`);

    if (this.mapaBaseActual === baseMapId && this.hasActiveBaseMapLayer() && !this.pendingBaseMapChange) {
      if (this.DEBUG_MAP) {
        console.log('[MapaTresD] El mapa base ya está activo:', baseMapId);
      }
      return;
    }

    if (this.DEBUG_MAP) {
      console.log('[MapaTresD] Solicitando mapa base:', baseMapId);
      console.log('[MapaTresD] Tiles:', config?.tiles ?? []);
      console.log('[MapaTresD] BaseMapConfig:', {
        provider: config?.provider ?? null,
        tileSize: config?.tileSize ?? null,
        maxzoom: config?.maxZoom ?? null,
      });
    }

    if (!this.map.loaded()) {
      if (this.DEBUG_MAP) {
        console.log('[MapaTresD] MapLibre todavía no está listo para cambiar el mapa base:', baseMapId);
      }
      return;
    }

    if (!config) {
      console.error('[MapaTresD] Configuración inexistente:', baseMapId);
      return;
    }

    if (
      baseMapId === this.activeBaseMapId &&
      this.map.getSource(this.activeBaseMapSourceId) &&
      this.map.getLayer(this.activeBaseMapLayerId) &&
      !this.pendingBaseMapChange
    ) {
      return;
    }

    try {
      this.requestedBaseMapId = baseMapId;
      this.baseMapControl?.setRequestedBaseMap(baseMapId);

      const terrainBefore = this.map.getTerrain();
      const cameraBefore = {
        center: this.map.getCenter(),
        zoom: this.map.getZoom(),
        pitch: this.map.getPitch(),
        bearing: this.map.getBearing(),
      };

    if (this.DEBUG_MAP) {
      console.log('[BASE MAP CHANGE]', {
        requested: baseMapId,
        previous: this.activeBaseMapId,
        terrainBefore,
        cameraBefore,
      });
    }

    console.log('[BASE MAP REQUEST]', {
      transitionId: this.baseMapChangeSequence + 1,
      requestedMap: baseMapId,
      previousMap: this.activeBaseMapId,
      terrain: terrainBefore,
    });

    this.baseMapTileErrorProvider = baseMapId;
    this.baseMapTileErrorCount = 0;
    this.baseMapFallbackInProgress = false;
    this.cancelPendingBaseMapChange();
    this.startPendingBaseMapChange(baseMapId, config, terrainBefore, cameraBefore);
    } catch (error) {
      console.error('[MapaTresD] Error cargando tiles de:', baseMapId, error);
    }
  }

  // ======================================================
  // RESIZE
  // ======================================================

  private observeResize(): void {
    const container = this.mapContainer.nativeElement;

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', this.handleWindowResize);
      return;
    }

    this.resizeObserver = new ResizeObserver(() => {
      this.scheduleResize('ResizeObserver');
    });

    this.resizeObserver.observe(container);
  }

  private readonly handleWindowResize = (): void => {
    this.scheduleResize('window.resize');
  };

  private resizeMapIfNeeded(reason: string): void {
    if (!this.map || this.resizeScheduled || !this.mapContainer) {
      return;
    }

    const element = this.mapContainer.nativeElement;
    const width = Math.round(element.clientWidth);
    const height = Math.round(element.clientHeight);

    if (width <= 0 || height <= 0) {
      return;
    }

    if (width === this.lastMapWidth && height === this.lastMapHeight) {
      return;
    }

    if (this.demLoadTestActive && width > 0 && height > 0) {
      return;
    }

    this.lastMapWidth = width;
    this.lastMapHeight = height;
    this.resizeScheduled = true;

    window.requestAnimationFrame(() => {
      this.resizeScheduled = false;

      if (!this.map) {
        return;
      }

      if (this.DEBUG_MAP) {
        console.count('[COUNT] resize');
        console.log('[MAP RESIZE]', reason, width, height);
      }
      this.map.resize();
      this.logMapCanvasInfo('[MAP SIZE AFTER RESIZE]');

      if (this.demActivationPending && this.vista3DActiva && width > 0 && height > 0) {
        this.activarDemVisible();
      }
    });
  }

  private startPendingBaseMapChange(
    baseMapId: BaseMapId,
    config: BaseMapConfig,
    terrainBefore?: unknown,
    cameraBefore?: { center: maplibregl.LngLat; zoom: number; pitch: number; bearing: number },
  ): void {
    if (!this.map) {
      return;
    }

    this.logStyleState(`startPendingBaseMapChange:${baseMapId}`);

    const token = ++this.baseMapChangeSequence;
    const sourceId = this.activeBaseMapSourceId === this.BASE_SOURCE_ID ? this.BASE_SOURCE_ID_NEXT : this.BASE_SOURCE_ID;
    const layerId = this.activeBaseMapLayerId === this.BASE_LAYER_ID ? this.BASE_LAYER_ID_NEXT : this.BASE_LAYER_ID;
    const previousSourceId = this.activeBaseMapSourceId;
    const previousLayerId = this.activeBaseMapLayerId;
    const timeoutId = window.setTimeout(() => {
      if (this.pendingBaseMapChange?.token === token) {
        this.failPendingBaseMapChange('Timeout esperando tiles del proveedor.');
      }
    }, this.BASE_MAP_LOAD_TIMEOUT_MS);
    const blackGapTimerId = window.setInterval(() => {
      this.ensureBaseMapVisible(token);
    }, this.BASE_MAP_BLACK_GAP_CHECK_MS);

    const sourceDataHandler = (event: { sourceId?: string; isSourceLoaded?: boolean }): void => {
      if (this.pendingBaseMapChange?.token !== token) {
        return;
      }

      if (event.sourceId !== sourceId || !event.isSourceLoaded) {
        return;
      }

      if (this.DEBUG_MAP) {
        console.log('[BASE MAP TILE READY]', {
          transitionId: token,
          sourceId,
          layerId,
          previousSourceId,
          previousLayerId,
          terrain: this.map?.getTerrain(),
        });
      }

      this.completePendingBaseMapChange(token);
    };

    this.pendingBaseMapChange = {
      token,
      baseMapId,
      config,
      sourceId,
      layerId,
      previousSourceId,
      previousLayerId,
      timeoutId,
      blackGapTimerId,
      sourceDataHandler,
    };

    this.map.on('sourcedata', sourceDataHandler);

    const tiles = config.tiles ?? [];

    if (!tiles.length) {
      this.failPendingBaseMapChange('La configuracion del mapa base no tiene tiles raster.');
      return;
    }

    try {
      console.log('[BASE MAP URL]', {
        id: baseMapId,
        tiles: config.tiles ?? [],
        maxzoom: config.maxZoom ?? null,
        tileSize: config.tileSize ?? null,
      });

      this.map.addSource(sourceId, this.createBaseMapSourceSpecification(baseMapId));

      const beforeLayerId = this.getFirstNonBaseLayerId();

      this.map.addLayer(
        {
          id: layerId,
          type: 'raster',
          source: sourceId,
          layout: {
            visibility: 'visible',
          },
          paint: {
            'raster-opacity': 0,
          },
        },
        beforeLayerId,
      );
    } catch (error) {
      this.failPendingBaseMapChange(error);
    }
  }

  private completePendingBaseMapChange(token: number): void {
    if (!this.map) {
      return;
    }

    const pending = this.pendingBaseMapChange;

    if (!pending || pending.token !== token) {
      return;
    }

    this.logStyleState(`completePendingBaseMapChange:${pending.baseMapId}`);
    this.setLayerOpacity(pending.layerId, 1);
    if (typeof this.map.triggerRepaint === 'function') {
      this.map.triggerRepaint();
    }

    if (this.map.getLayer(pending.previousLayerId)) {
      this.map.removeLayer(pending.previousLayerId);
    }

    if (this.map.getSource(pending.previousSourceId)) {
      this.map.removeSource(pending.previousSourceId);
    }

    this.clearPendingBaseMapChange(false);

    this.baseMapTileErrorCount = 0;
    this.baseMapTileErrorProvider = pending.baseMapId;
    this.activeBaseMapSourceId = pending.sourceId;
    this.activeBaseMapLayerId = pending.layerId;
    this.activeBaseMapId = pending.baseMapId;
    this.requestedBaseMapId = null;
    this.mapaBaseActual = pending.baseMapId;
    this.baseMapFallbackInProgress = false;
    this.baseMapControl?.setActiveBaseMap(pending.baseMapId);

    if (this.DEBUG_MAP) {
      console.log('[BASE MAP COMMIT]', {
        transitionId: pending.token,
        activeSource: this.activeBaseMapSourceId,
        nextSource: pending.sourceId,
        terrain: this.map.getTerrain(),
      });
      console.log('[BASE MAP CHANGED]', {
        active: pending.baseMapId,
        sourceExists: !!this.map.getSource(this.activeBaseMapSourceId),
        layerExists: !!this.map.getLayer(this.activeBaseMapLayerId),
        terrainAfter: this.map.getTerrain(),
      });
      console.log('[MAP SOURCES]', Object.keys(this.map.getStyle()?.sources ?? {}));
      console.log(
        '[RASTER LAYERS]',
        this.map
          .getStyle()
          ?.layers?.filter((layer) => layer.type === 'raster')
          .map((layer) => ({
            id: layer.id,
            source: layer.source,
          })) ?? [],
      );
    }

    this.imprimirOrdenCapas();
  }

  private failPendingBaseMapChange(reason: unknown): void {
    const pending = this.pendingBaseMapChange;

    if (!pending) {
      return;
    }

    console.error(
      typeof reason === 'string' && reason.toLowerCase().includes('timeout')
        ? '[BASE MAP TIMEOUT]'
        : '[BASE MAP ROLLBACK]',
      {
        requestedMap: pending.baseMapId,
        previousMap: this.activeBaseMapId,
        reason,
      },
    );

    this.clearPendingBaseMapChange(true);

    console.error('[MapaTresD] Error cargando tiles de:', pending.baseMapId, reason);

    this.requestedBaseMapId = null;
    if (this.hasActiveBaseMapLayer()) {
      this.baseMapFallbackInProgress = false;
      this.baseMapControl?.setActiveBaseMap(this.activeBaseMapId);
      return;
    }

    this.zone.run(() => {
      this.mapError = this.formatMapErrorMessage(reason);
      this.loading = false;
      this.baseMapFallbackInProgress = false;
      this.baseMapControl?.setActiveBaseMap(this.activeBaseMapId);
    });
  }

  private cancelPendingBaseMapChange(): void {
    this.clearPendingBaseMapChange(true);
  }

  private clearPendingBaseMapChange(removeLayerAndSource: boolean): void {
    const pending = this.pendingBaseMapChange;

    if (!pending || !this.map) {
      return;
    }

    this.map.off('sourcedata', pending.sourceDataHandler);
    window.clearTimeout(pending.timeoutId);
    window.clearInterval(pending.blackGapTimerId);

    if (removeLayerAndSource) {
      if (this.map.getLayer(pending.layerId)) {
        this.map.removeLayer(pending.layerId);
      }

      if (this.map.getSource(pending.sourceId)) {
        this.map.removeSource(pending.sourceId);
      }
    }

    this.pendingBaseMapChange = null;
  }

  private ensureBaseMapVisible(token: number): void {
    if (!this.map || this.pendingBaseMapChange?.token !== token) {
      return;
    }

    const rasterLayers = (this.map.getStyle()?.layers ?? []).filter((layer) => layer.type === 'raster');
    const visibleBaseLayers = rasterLayers.filter(
      (layer) =>
        String(layer.id).startsWith('base-map-layer') &&
        (layer.layout?.visibility ?? 'visible') !== 'none' &&
        (this.map?.getPaintProperty(layer.id, 'raster-opacity') as number | undefined | null) !== 0,
    );

    if (visibleBaseLayers.length > 0) {
      return;
    }

    console.error('[BASE MAP BLACK GAP]', {
      transitionId: token,
      activeSource: this.activeBaseMapSourceId,
      nextSource: this.pendingBaseMapChange?.sourceId ?? null,
      terrain: this.map.getTerrain(),
    });

    this.failPendingBaseMapChange('No raster base visible durante la transicion.');
  }

  private removeBaseMapLayer(): void {
    if (!this.map) {
      return;
    }

    if (this.map.getLayer(this.activeBaseMapLayerId)) {
      this.map.removeLayer(this.activeBaseMapLayerId);
    }

    if (this.map.getSource(this.activeBaseMapSourceId)) {
      this.map.removeSource(this.activeBaseMapSourceId);
    }
  }

  private setLayerOpacity(layerId: string, opacity: number): void {
    if (!this.map || !this.map.getLayer(layerId)) {
      return;
    }

    this.map.setPaintProperty(layerId, 'raster-opacity', opacity);
  }

  private hasActiveBaseMapLayer(): boolean {
    if (!this.map) {
      return false;
    }

    return !!this.map.getLayer(this.activeBaseMapLayerId) && !!this.map.getSource(this.activeBaseMapSourceId);
  }

  private getFirstNonBaseLayerId(): string | undefined {
    const layers = this.map?.getStyle().layers ?? [];
    return layers.find((layer) => layer.id !== this.activeBaseMapLayerId)?.id;
  }

  private extractErrorDetail(event: unknown): unknown {
    const errorEvent = event as { error?: unknown };
    return errorEvent.error ?? event;
  }

  private isDemManagedSourceId(sourceId?: string | null): boolean {
    return (
      sourceId === this.DEM_TERRAIN_SOURCE_ID ||
      sourceId === this.DEM_HILLSHADE_SOURCE_ID ||
      sourceId === this.DEM_CONTROL_SOURCE_ID ||
      sourceId === this.DEM_LOCAL_TEST_SOURCE_ID
    );
  }

  private extractDemMapErrorContext(event: unknown, error: unknown): DemMapErrorContext {
    const candidate = (event ?? {}) as Record<string, unknown>;
    const nestedError = (candidate['error'] ?? {}) as Record<string, unknown>;
    const source = nestedError && Object.keys(nestedError).length > 0 ? nestedError : candidate;
    const sourceId = (source['sourceId'] ?? candidate['sourceId'] ?? null) as string | null;
    const status = (source['status'] ?? candidate['status'] ?? null) as unknown;
    const url = (source['url'] ?? candidate['url'] ?? null) as string | null;
    const tile = source['tile'] ?? candidate['tile'] ?? null;
    const rawMessage = source['message'] ?? candidate['message'] ?? null;
    const message =
      typeof rawMessage === 'string' && rawMessage.length > 0
        ? rawMessage
        : error instanceof Error
          ? error.message
          : null;

    return {
      message,
      sourceId,
      status,
      tile,
      url,
    };
  }

  private extractBaseMapTileErrorContext(event: unknown, error: unknown): BaseMapTileErrorContext {
    const candidate = (event ?? {}) as Record<string, unknown>;
    const nestedError = (candidate['error'] ?? {}) as Record<string, unknown>;
    const source = nestedError && Object.keys(nestedError).length > 0 ? nestedError : candidate;
    const sourceId = (source['sourceId'] ?? candidate['sourceId'] ?? null) as string | null;
    const status = (source['status'] ?? candidate['status'] ?? null) as unknown;
    const url = (source['url'] ?? candidate['url'] ?? null) as string | null;
    const tile = source['tile'] ?? candidate['tile'] ?? null;
    const rawMessage = source['message'] ?? candidate['message'] ?? null;
    const message =
      typeof rawMessage === 'string' && rawMessage.length > 0
        ? rawMessage
        : error instanceof Error
          ? error.message
          : null;

    return {
      message,
      sourceId,
      status,
      tile,
      url,
    };
  }

  private isBaseMapTileUrl(url: string): boolean {
    const normalizedUrl = url.toLowerCase();
    return (
      normalizedUrl.includes('tile.openstreetmap.org') ||
      normalizedUrl.includes('server.arcgisonline.com') ||
      normalizedUrl.includes('tile.opentopomap.org') ||
      normalizedUrl.includes('basemaps.cartocdn.com')
    );
  }

  private formatMapErrorMessage(reason: unknown): string {
    if (reason instanceof Error && reason.message) {
      return reason.message;
    }

    if (typeof reason === 'string' && reason.trim().length > 0) {
      return reason;
    }

    return 'No fue posible inicializar el mapa 3D.';
  }

  // ======================================================
  // FUTURO TERRENO / DEM
  // ======================================================

  /*
   * FUTURO:
   * El DEM de Colombia (~90 m) no se carga directamente en Angular.
   * La arquitectura prevista será:
   * DEM Colombia -> servidor de terreno -> raster-dem tiles -> MapLibre -> terrain 3D.
   *
   * Ejemplo futuro:
   *
   * this.map.addSource('terrain-colombia', {
   *   type: 'raster-dem',
   *   tiles: ['https://SERVIDOR/terrain/{z}/{x}/{y}.png'],
   *   tileSize: 256,
   *   encoding: 'terrarium',
   * });
   *
   * this.map.setTerrain({
   *   source: 'terrain-colombia',
   *   exaggeration: 1,
   * });
   *
   * Hillshade y relieve se podrán derivar de la misma fuente DEM.
   */

  // ======================================================
  // DEM / TERRENO 3D
  // ======================================================

  private async verificarServidorDem(): Promise<void> {
    if (this.terrainDiagnosticMode) {
      console.log('[DEM DIAG] DEM verification suppressed during terrain diagnostics.');
      return;
    }

    if (this.demVerified || this.demVerificationInProgress) {
      if (this.demVerified && this.demAvailable) {
        this.configurarDem();
      }
      return;
    }

    this.demVerificationInProgress = true;
    const demHealthUrl = this.vulcanoApi.healthUrl;

    if (this.DEBUG_MAP) {
      console.log('[DEM HEALTH CHECK URL]', demHealthUrl);
    }

    try {
      const response = await this.vulcanoApi.getResource(demHealthUrl);

      this.demAvailable = response.ok;
      if (this.DEBUG_MAP) {
        console.log('[DEM HEALTH]', {
          url: demHealthUrl,
          status: response.status,
          ok: response.ok,
        });
      }

      if (!this.demAvailable) {
        console.warn('[DEM] Servidor DEM no disponible. Se mantiene el mapa sin terreno 3D.');
      } else {
        console.log('[DEM] Servidor DEM disponible');
      }
    } catch (error) {
      this.demAvailable = false;
      console.warn('[DEM] Servidor DEM no disponible. Se mantiene el mapa sin terreno 3D.');
      console.error('[DEM] Error:', error);
    } finally {
      this.demVerified = true;
      this.demVerificationInProgress = false;
      if (this.demAvailable) {
        this.configurarDem();
      }
    }
  }

  private configurarDem(): void {
    if (this.terrainDiagnosticMode) {
      console.log('[DEM DIAG] configurarDem suppressed during terrain diagnostics.');
      return;
    }

    if (!this.map) {
      return;
    }

    if (!this.demVerified && !this.demVerificationInProgress) {
      void this.verificarServidorDem();
      return;
    }

    if (!this.styleInitialized) {
      this.demActivationPending = true;
      console.log('[DEM] Esperando inicialización del style.');
      return;
    }

    if (!this.demAvailable) {
      console.warn('[DEM] Backend no disponible.');
      return;
    }

    if (!this.isMapContainerVisible()) {
      this.demActivationPending = true;
      console.log('[DEM] Contenedor oculto.');
      return;
    }

    this.activarTerrain();
    this.demConfigured = true;
    this.demActivationPending = false;
  }

  private startDemLoadTestWindow(durationMs = 15000): void {
    this.demLoadTestActive = true;

    if (this.demLoadTestTimerId !== null) {
      window.clearTimeout(this.demLoadTestTimerId);
    }

    this.demLoadTestTimerId = window.setTimeout(() => {
      this.demLoadTestActive = false;
      this.demLoadTestTimerId = null;
    }, durationMs);
  }

  private scheduleDemLoadDiagnosticFinalState(durationMs = 30000): void {
    if (this.demLoadFinalSummaryTimerId !== null) {
      window.clearTimeout(this.demLoadFinalSummaryTimerId);
    }

    this.demLoadFinalSummaryTimerId = window.setTimeout(() => {
      this.demLoadFinalSummaryTimerId = null;
      void this.logDemLoadDiagnosticFinalState();
    }, durationMs);
  }

  private async logDemLoadDiagnosticFinalState(): Promise<void> {
    if (!this.map) {
      return;
    }

    const center = this.map.getCenter();
    const terrainSource = this.map.getSource(this.DEM_TERRAIN_SOURCE_ID);
    const hillshadeSource = this.map.getSource(this.DEM_HILLSHADE_SOURCE_ID);
    const backendElevation = await this.fetchBackendElevation(center.lng, center.lat);
    const maplibreElevation =
      typeof this.map.queryTerrainElevation === 'function'
        ? this.map.queryTerrainElevation([center.lng, center.lat])
        : null;

    const realTileChecks = [...this.demRealTileChecks].slice(0, this.DEM_MAX_REAL_TILE_CHECKS);

    console.log('[DEM SPLIT FINAL]', {
      requestedTiles: [...this.demRequestedTiles].slice(0, this.DEM_MAX_REAL_TILE_CHECKS),
      realTileChecks,
      terrain: this.map.getTerrain(),
      terrainSource: terrainSource?.serialize?.() ?? null,
      hillshadeSource: hillshadeSource?.serialize?.() ?? null,
      terrainSourceLoaded: this.safeIsSourceLoaded(this.DEM_TERRAIN_SOURCE_ID),
      hillshadeSourceLoaded: this.safeIsSourceLoaded(this.DEM_HILLSHADE_SOURCE_ID),
      hillshadeLayer: !!this.map.getLayer(this.DEM_HILLSHADE_LAYER_ID),
      elevation: maplibreElevation,
      backendElevation,
      mapErrors: this.demMapErrors,
    });
  }

  private safeIsSourceLoaded(sourceId: string, map: MapLibreMap | null = this.map): boolean {
    if (!map) {
      return false;
    }

    const source = map.getSource(sourceId);
    if (!source) {
      return false;
    }

    try {
      return map.isSourceLoaded(sourceId);
    } catch (error) {
      console.warn('[DEM SOURCE LOAD CHECK SKIPPED]', sourceId, error);
      return false;
    }
  }

  private scheduleTerrainElevationCheckpoints(): void {
    for (const timerId of this.terrainCheckpointTimerIds) {
      window.clearTimeout(timerId);
    }
    this.terrainCheckpointTimerIds = [];

    const timerId = window.setTimeout(() => {
      this.logTerrainElevationCheckpoint(5);
    }, 5000);

    this.terrainCheckpointTimerIds.push(timerId);
  }

  private logTerrainElevationCheckpoint(seconds: number): void {
    if (!this.map) {
      return;
    }

    const center = this.map.getCenter();
    const elevation =
      typeof this.map.queryTerrainElevation === 'function'
        ? this.map.queryTerrainElevation([center.lng, center.lat])
        : null;

    if (this.DEBUG_MAP) {
      console.log('[MAPA-TRES-D TERRAIN CHECK]', {
        elevation,
        terrain: this.map.getTerrain(),
        sourceExists: !!this.map.getSource(this.DEM_TERRAIN_SOURCE_ID),
      });
    }

    if (this.mapPerformance.firstElevationAt === 0 && typeof elevation === 'number' && Number.isFinite(elevation)) {
      this.mapPerformance.firstElevationAt = performance.now();
      this.logMapPerformance('first-elevation');
    }
  }

  private ensureDemHillshadeLayer(): void {
    if (!this.map || this.map.getLayer(this.DEM_HILLSHADE_LAYER_ID)) {
      return;
    }

    const layer = {
      id: this.DEM_HILLSHADE_LAYER_ID,
      type: 'hillshade' as const,
      source: this.DEM_HILLSHADE_SOURCE_ID,
      paint: {
        'hillshade-exaggeration': 0.8,
      },
    };

    const beforeLayerId = this.getFirstNonBaseLayerId();
    if (beforeLayerId) {
      this.map.addLayer(layer, beforeLayerId);
    } else {
      this.map.addLayer(layer);
    }
  }

  private readonly transformMapRequest = (url: string, resourceType?: string): { url: string } => {
    if (url.includes('/dem/tiles/')) {
      if (this.demRequestLogCount < this.DEM_REQUEST_LOG_LIMIT) {
        this.demRequestLogCount += 1;
        console.log('[DEM REQUEST]', {
          url,
          resourceType,
          count: this.demRequestLogCount,
        });
      }

      if (!this.demRequestedTileSet.has(url) && this.demRequestedTiles.length < this.DEM_MAX_REAL_TILE_CHECKS) {
        this.demRequestedTileSet.add(url);
        this.demRequestedTiles.push(url);

        if (!this.firstDemTileUrl) {
          this.firstDemTileUrl = url;
        }

        void this.inspectRealDemTile(url);
      }
    }

    return { url };
  };

  private async inspectRealDemTile(url: string): Promise<void> {
    if (this.demRealTileCheckSet.has(url)) {
      return;
    }

    this.demRealTileCheckSet.add(url);

    try {
      const response = await this.vulcanoApi.getResource(url);
      const contentType = response.headers.get('content-type');
      const contentLength = response.headers.get('content-length');
      const cacheControl = response.headers.get('cache-control');
      const accessControlAllowOrigin = response.headers.get('access-control-allow-origin');
      const blob = await response.blob();

      this.firstDemTileHttpStatus = response.status;
      this.firstDemTileBlobSize = blob.size;
      this.firstDemTileContentType = contentType;

      console.log('[DEM REAL TILE HTTP]', {
        url,
        status: response.status,
        ok: response.ok,
        contentType,
        contentLength,
        cacheControl,
        accessControlAllowOrigin,
        blobSize: blob.size,
      });

      const tileInfo: DemRealTileCheck = {
        url,
        z: null,
        x: null,
        y: null,
        status: response.status,
        ok: response.ok,
        bytes: blob.size,
        width: null,
        height: null,
        minElevation: null,
        maxElevation: null,
        meanElevation: null,
        alphaMin: null,
        alphaMax: null,
        contentType,
        contentLength,
        cacheControl,
        accessControlAllowOrigin,
        intersectsDemBounds: this.getDemTileBoundsIntersection(url),
        isUniform: null,
        error: response.ok ? null : `HTTP ${response.status}`,
        source: 'terrarium',
      };

      this.storeRealTileCheck(tileInfo);

      if (!response.ok) {
        return;
      }

      const bitmap = await createImageBitmap(blob);
      if (bitmap.width !== 256 || bitmap.height !== 256) {
        tileInfo.width = bitmap.width;
        tileInfo.height = bitmap.height;
        tileInfo.error = `Dimensiones inesperadas ${bitmap.width}x${bitmap.height}`;
        this.storeRealTileCheck(tileInfo);
        bitmap.close?.();
        return;
      }

      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;

      const context = canvas.getContext('2d');
      if (!context) {
        tileInfo.width = bitmap.width;
        tileInfo.height = bitmap.height;
        tileInfo.error = 'No fue posible crear el contexto 2D.';
        this.storeRealTileCheck(tileInfo);
        console.warn('[DEM REQUEST TILE DECODE] No fue posible crear el contexto 2D.');
        return;
      }

      context.drawImage(bitmap, 0, 0);
      bitmap.close?.();

      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      let sum = 0;
      let count = 0;
      let alphaMin = 255;
      let alphaMax = 0;
      let firstPixel: string | null = null;
      let isUniform = true;

      for (let index = 0; index < data.length; index += 4) {
        const red = data[index];
        const green = data[index + 1];
        const blue = data[index + 2];
        const alpha = data[index + 3];
        const pixelSignature = `${red},${green},${blue},${alpha}`;
        if (firstPixel === null) {
          firstPixel = pixelSignature;
        } else if (firstPixel !== pixelSignature) {
          isUniform = false;
        }

        const elevation = red * 256 + green + blue / 256 - 32768;

        min = Math.min(min, elevation);
        max = Math.max(max, elevation);
        sum += elevation;
        count += 1;
        alphaMin = Math.min(alphaMin, alpha);
        alphaMax = Math.max(alphaMax, alpha);
      }

      const meanElevation = count > 0 ? sum / count : null;
      this.firstDemTileBrowserMin = Number.isFinite(min) ? min : null;
      this.firstDemTileBrowserMax = Number.isFinite(max) ? max : null;
      this.firstDemTileBrowserMean = meanElevation;
      this.firstDemTileAlphaMin = alphaMin;
      this.firstDemTileAlphaMax = alphaMax;
      this.firstDemTileEncoding = 'terrarium';

      tileInfo.width = canvas.width;
      tileInfo.height = canvas.height;
      tileInfo.minElevation = this.firstDemTileBrowserMin;
      tileInfo.maxElevation = this.firstDemTileBrowserMax;
      tileInfo.meanElevation = this.firstDemTileBrowserMean;
      tileInfo.alphaMin = this.firstDemTileAlphaMin;
      tileInfo.alphaMax = this.firstDemTileAlphaMax;
      tileInfo.isUniform = isUniform;
      tileInfo.error = null;

      this.storeRealTileCheck(tileInfo);

      console.log('[DEM REAL TILE DECODE]', {
        url,
        width: canvas.width,
        height: canvas.height,
        minElevation: this.firstDemTileBrowserMin,
        maxElevation: this.firstDemTileBrowserMax,
        meanElevation: this.firstDemTileBrowserMean,
        alphaMin: this.firstDemTileAlphaMin,
        alphaMax: this.firstDemTileAlphaMax,
        isUniform,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[DEM REAL TILE DECODE] Error:', error);
      this.storeRealTileCheck({
        url,
        z: null,
        x: null,
        y: null,
        status: null,
        ok: false,
        bytes: null,
        width: null,
        height: null,
        minElevation: null,
        maxElevation: null,
        meanElevation: null,
        alphaMin: null,
        alphaMax: null,
        contentType: null,
        contentLength: null,
        cacheControl: null,
        accessControlAllowOrigin: null,
        intersectsDemBounds: this.getDemTileBoundsIntersection(url),
        isUniform: null,
        error: message,
        source: 'terrarium',
      });
      this.demMapErrors.push({
        message,
        url,
      });
    }
  }

  private storeRealTileCheck(tile: DemRealTileCheck): void {
    const index = this.demRealTileChecks.findIndex((entry) => entry.url === tile.url);
    if (index >= 0) {
      this.demRealTileChecks[index] = tile;
    } else {
      this.demRealTileChecks.push(tile);
    }
  }

  private getDemTileBoundsIntersection(url: string): boolean | null {
    const tile = this.parseDemTileUrl(url);
    if (!tile) {
      return null;
    }

    const tileBounds = this.getTileBounds(tile.z, tile.x, tile.y);
    const demBounds = this.DEM_BOUNDS;

    return !(
      tileBounds.maxLng < demBounds[0] ||
      tileBounds.minLng > demBounds[2] ||
      tileBounds.maxLat < demBounds[1] ||
      tileBounds.minLat > demBounds[3]
    );
  }

  private parseDemTileUrl(url: string): { z: number; x: number; y: number } | null {
    const match = url.match(/\/dem\/tiles\/(\d+)\/(\d+)\/(\d+)\.png(?:\?.*)?$/);
    if (!match) {
      return null;
    }

    return {
      z: Number(match[1]),
      x: Number(match[2]),
      y: Number(match[3]),
    };
  }

  private getTileBounds(z: number, x: number, y: number): {
    minLng: number;
    minLat: number;
    maxLng: number;
    maxLat: number;
  } {
    const n = 2 ** z;
    const lon1 = (x / n) * 360 - 180;
    const lon2 = ((x + 1) / n) * 360 - 180;

    const latRad1 = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
    const latRad2 = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n)));

    const lat1 = (latRad1 * 180) / Math.PI;
    const lat2 = (latRad2 * 180) / Math.PI;

    return {
      minLng: Math.min(lon1, lon2),
      maxLng: Math.max(lon1, lon2),
      minLat: Math.min(lat1, lat2),
      maxLat: Math.max(lat1, lat2),
    };
  }

  private async fetchBackendElevation(lng: number, lat: number): Promise<number | null> {
    try {
      const response = await this.vulcanoApi.getResource(this.vulcanoApi.elevationUrl(lat, lng));

      if (!response.ok) {
        return null;
      }

      const data = (await response.json()) as {
        elevacion?: number;
        elevation?: number;
      };

      const value = data.elevacion ?? data.elevation ?? null;
      return typeof value === 'number' ? value : null;
    } catch (error) {
      this.demMapErrors.push({
        message: error instanceof Error ? error.message : String(error),
        url: this.vulcanoApi.elevationUrl(lat, lng),
      });
      return null;
    }
  }

  private getDemTilesUrl(): string {
    return this.vulcanoApi.tilesUrl;
  }

  private createDemSourceConfig(): RasterDEMSourceSpecification {
    return {
      type: 'raster-dem',
      tiles: [this.vulcanoApi.tilesUrl],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 13,
      encoding: 'terrarium',
    };
  }

  private activarTerrain(): void {
    if (!this.map) {
      return;
    }

    if (!this.map.getSource(this.DEM_TERRAIN_SOURCE_ID)) {
      this.map.addSource(this.DEM_TERRAIN_SOURCE_ID, this.createDemSourceConfig());
    }

    this.vista3DActiva = true;
    this.demActivationPending = false;

    this.map.setProjection({
      type: 'mercator',
    });

    const terrain = this.map.getTerrain();
    const terrainNeedsApply =
      terrain?.source !== this.DEM_TERRAIN_SOURCE_ID ||
      terrain?.exaggeration !== this.DEM_TARGET_EXAGGERATION;

    if (terrainNeedsApply) {
      if (this.DEBUG_MAP) {
        console.count('[REAL TERRAIN APPLY]');
      }
      this.mapPerformance.terrainApplyAt = performance.now();
      this.map.setTerrain({
        source: this.DEM_TERRAIN_SOURCE_ID,
        exaggeration: this.DEM_TARGET_EXAGGERATION,
      });
      this.registerIdlePerformanceProbe();
    }

    if (!this.terrainCameraPresetApplied) {
      this.terrainCameraPresetApplied = true;
      this.map.jumpTo({
        center: [-74.05, 4.65],
        zoom: 10,
        pitch: this.DEM_TARGET_PITCH,
        bearing: 0,
      });
    } else if (Math.abs(this.map.getPitch() - this.DEM_TARGET_PITCH) > 0.1) {
      this.map.easeTo({
        pitch: this.DEM_TARGET_PITCH,
        duration: 0,
      });
    }

    this.scheduleTerrainElevationCheckpoints();
  }

  private activarDemVisible(): void {
    if (!this.map) {
      return;
    }

    this.configurarDem();
    return;

    /*
    this.demActivationInProgress = true;
    this.logStyleState('activarDemVisible');

    try {
      const container = this.mapContainer.nativeElement;
      const width = container.clientWidth;
      const height = container.clientHeight;

      console.log('[DEM ACTIVATE]', {
        width,
        height,
        demAvailable: this.demAvailable,
        styleLoaded: this.map.isStyleLoaded(),
        terrainSourceExists: !!this.map.getSource(this.DEM_TERRAIN_SOURCE_ID),
        hillshadeSourceExists: !!this.map.getSource(this.DEM_HILLSHADE_SOURCE_ID),
        terrainBefore: this.map.getTerrain(),
      });

      if (width <= 0 || height <= 0) {
        this.demActivationPending = true;
        console.warn('[DEM ACTIVATE] contenedor todavía sin dimensiones');
        return;
      }

      if (!this.styleInitialized) {
        this.demActivationPending = true;
        console.log('[DEM] Esperando inicialización del style.');
        return;
      }

      this.demActivationPending = false;
      this.map.resize();
      this.map.setProjection({
        type: 'mercator',
      });
      this.startDemLoadTestWindow(15000);
      this.scheduleDemLoadDiagnosticFinalState(30000);
      this.configurarDem();
      this.map.triggerRepaint();

      if (!this.demCameraDiagnosticApplied) {
        this.demCameraDiagnosticApplied = true;
        this.map.jumpTo({
          center: [-74.05, 4.65],
          zoom: 10,
          pitch: 70,
          bearing: 0,
        });
      }

      window.setTimeout(() => {
        if (!this.map) {
          return;
        }

        console.log('[DEM FINAL STATE]', {
          demAvailable: this.demAvailable,
          pending: this.demActivationPending,
          projection: this.map.getProjection().type,
          terrainSourceExists: !!this.map.getSource(this.DEM_TERRAIN_SOURCE_ID),
          hillshadeSourceExists: !!this.map.getSource(this.DEM_HILLSHADE_SOURCE_ID),
          terrain: this.map.getTerrain(),
          center: this.map.getCenter(),
          zoom: this.map.getZoom(),
          pitch: this.map.getPitch(),
          elevation:
            typeof this.map.queryTerrainElevation === 'function'
              ? this.map.queryTerrainElevation([this.map.getCenter().lng, this.map.getCenter().lat])
              : null,
        });
      }, 2000);

      console.log('[DEM ACTIVATE] terrainAfter:', this.map.getTerrain());
    } finally {
      this.demActivationInProgress = false;
    }
    */
  }

  private verificarElevacionTerrain(): void {
    let attempts = 0;
    let lastSourceLoaded: boolean | null = null;
    let lastElevation: number | null = null;
    const timer = window.setInterval(() => {
      if (!this.map) {
        window.clearInterval(timer);
        return;
      }

      attempts += 1;
      const center = this.map.getCenter();
      const elevation = this.map.queryTerrainElevation([center.lng, center.lat]);
      const sourceLoaded = this.safeIsSourceLoaded(this.DEM_TERRAIN_SOURCE_ID);
      const hillshadeLoaded = this.safeIsSourceLoaded(this.DEM_HILLSHADE_SOURCE_ID);

      if (sourceLoaded !== lastSourceLoaded || elevation !== lastElevation || attempts === 1) {
        console.log('[DEM ELEVATION]', {
          attempts,
          elevation,
          sourceLoaded,
          hillshadeLoaded,
        });
        lastSourceLoaded = sourceLoaded;
        lastElevation = elevation;
      }

      if (typeof elevation === 'number' && Math.abs(elevation) > 0.1) {
        window.clearInterval(timer);
        console.log('[DEM SUCCESS]', elevation);
      }

      if (attempts >= 60) {
        window.clearInterval(timer);
      }
    }, 500);
  }

  private registrarPruebaTerrain(
    sourceId: string = this.DEM_TERRAIN_SOURCE_ID,
    etiqueta = '[DEM FINAL TEST]',
    compararConBackend = true,
  ): void {
    if (!this.map || this.terrainIdleProbeRegistered) {
      return;
    }

    this.terrainIdleProbeRegistered = true;

    this.map.once('idle', () => {
      this.terrainIdleProbeRegistered = false;

      if (!this.map) {
        return;
      }

      const center = this.map.getCenter();
      const terrainElevation =
        typeof this.map.queryTerrainElevation === 'function'
          ? this.map.queryTerrainElevation([center.lng, center.lat])
          : null;

      this.logPitch('idle');

      console.log(etiqueta, {
        projection: this.map.getProjection().type,
        sourceId,
        sourceExists: !!this.map.getSource(sourceId),
        sourceLoaded: this.safeIsSourceLoaded(sourceId),
        terrain: this.map.getTerrain(),
        zoom: this.map.getZoom(),
        pitch: this.map.getPitch(),
        bearing: this.map.getBearing(),
        center: {
          lng: center.lng,
          lat: center.lat,
        },
        canvasWidth: this.map.getCanvas().width,
        canvasHeight: this.map.getCanvas().height,
        elevation: terrainElevation,
      });

      if (compararConBackend) {
        void this.compararElevacionConBackend(center.lng, center.lat);
      }
    });
  }

  private async compararElevacionConBackend(lng: number, lat: number): Promise<void> {
    if (!this.map || typeof this.map.queryTerrainElevation !== 'function') {
      return;
    }

    try {
      const response = await this.vulcanoApi.getResource(this.vulcanoApi.elevationUrl(lat, lng));

      if (!response.ok) {
        console.warn('[DEM DEBUG] Backend Rasterio no respondió correctamente:', response.status);
        return;
      }

      const backendData = (await response.json()) as {
        elevacion?: number;
        elevation?: number;
        value?: number;
        z?: number;
      };

      console.log('[DEM DEBUG] Backend response:', backendData);

      const backendElevation =
        backendData.elevacion ?? backendData.elevation ?? backendData.value ?? backendData.z ?? null;
      const maplibreElevation = this.map.queryTerrainElevation([lng, lat]);

      console.log('[DEM DEBUG] Backend Rasterio:', backendElevation);
      console.log('[DEM DEBUG] MapLibre terrain:', maplibreElevation);

      if (typeof backendElevation === 'number' && typeof maplibreElevation === 'number') {
        console.log('[DEM DEBUG] Diferencia:', Math.abs(backendElevation - maplibreElevation));
      }
    } catch (error) {
      console.error('[DEM DEBUG] Error comparando elevación:', error);
    }
  }

  // ======================================================
  // FUTURA INTEGRACIÓN THREE.JS
  // ======================================================

  /*
   * FUTURO:
   * Three.js NO se usa para crear el planeta.
   * MapLibre seguirá manejando:
   * - globo
   * - coordenadas
   * - mapas base
   * - DEM / terreno
   * - cámara geográfica
   *
   * Three.js se reservará para:
   * - modelos GLB
   * - objetos 3D
   * - marcadores 3D
   * - animaciones
   * - capas especiales
   *
   * La integración futura puede realizarse con MapLibre CustomLayerInterface.
   */

  public activarVista3D(): void {
    if (!this.map) {
      return;
    }

    if (this.terrainDiagnosticMode) {
      console.log('[DEM DIAG] activarVista3D suppressed during terrain diagnostics.');
      return;
    }

    this.vista3DActiva = true;
    this.pitch = this.DEM_TARGET_PITCH;
    this.demActivationPending = true;
    this.logStyleState('activarVista3D');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.activarDemVisible();
      });
    });
    this.logPitch('activarVista3D');
  }

  public activarVista2D(): void {
    if (!this.map) {
      return;
    }

    if (this.terrainDiagnosticMode) {
      console.log('[DEM DIAG] activarVista2D suppressed during terrain diagnostics.');
      return;
    }

    this.vista3DActiva = false;
    this.map.easeTo({
      pitch: 0,
      duration: 250,
    });
    this.logPitch('activarVista2D');
  }

  public onVistaVisible(): void {
    if (!this.map) {
      return;
    }
    // Reutiliza las mismas representaciones al volver a 3D, sin duplicarlas ni modificar la camara.
    this.puntosLayer.sync(this.map, this.puntosGeograficos);

    if (this.DEBUG_MAP) {
      console.log('[DEM MODE]', {
        autoDiagnostic: this.AUTO_RUN_TERRAIN_DIAGNOSTIC,
        diagnosticMode: this.terrainDiagnosticMode,
      });
    }

    if (this.AUTO_RUN_TERRAIN_DIAGNOSTIC) {
      this.scheduleResize('onVistaVisible');
      void this.intentarAutoEjecutarDiagnosticoTerrain();
      return;
    }

    if (this.terrainDiagnosticMode) {
      if (this.DEBUG_MAP) {
        console.log('[DEM DIAG] onVistaVisible suppressed during terrain diagnostics.');
      }
      return;
    }

    this.logStyleState('onVistaVisible');
    this.scheduleResize('onVistaVisible');

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (!this.map) {
          return;
        }

        this.vista3DActiva = true;
        this.demActivationPending = true;
        this.activarDemVisible();
        this.sincronizarTrayectoria3D();
      });
    });
  }

  private async intentarAutoEjecutarDiagnosticoTerrain(): Promise<void> {
    if (
      !this.AUTO_RUN_TERRAIN_DIAGNOSTIC ||
      this.terrainDiagnosticAlreadyExecuted ||
      this.diagnosticRunning
    ) {
      return;
    }

    for (let intentos = 0; intentos < 60; intentos += 1) {
      const map = this.map;
      const container = this.mapContainer?.nativeElement;
      const styleLoaded = !!map?.isStyleLoaded?.();

      if (map && styleLoaded && container?.clientWidth && container.clientHeight) {
        this.terrainDiagnosticAlreadyExecuted = true;
        await this.ejecutarDiagnosticoTerrainCompleto();
        return;
      }

      await this.sleep(250);
    }
  }

  public async ejecutarDiagnosticoTerrainCompleto(): Promise<void> {
    if (this.diagnosticRunning) {
      return;
    }

    this.diagnosticRunning = true;
    this.terrainDiagnosticMode = true;
    try {
      this.resetDiagnosticSession();
      this.setDiagnosticStage('Validando PNG local...', 0);
      await this.probarDecodificacionTileDemInterna();
      this.setDiagnosticStage('Probando DEM oficial...', 25);
      await this.sleep(500);
      await this.runDiagnosticStep('DEM OFICIAL', 20000, async () => {
        const baseReady = await this.prepararMapaDiagnosticoBase();
        if (!baseReady) {
          this.setDiagnosticResult({
            test: 'DEM OFICIAL',
            status: 'FAIL',
            message: 'Timeout durante preparacion del mapa base antes del DEM oficial.',
            timeoutStage: 'style',
            styleLoaded: false,
            sourceExists: false,
            sourceLoaded: false,
            idleReached: false,
            terrainSource: null,
            projection: null,
            elevation: null,
          });
          return;
        }

        await this.probarTerrainOficialInterna();
      });
      await this.sleep(1500);
      this.setDiagnosticStage('Probando style oficial...', 50);
      await this.runDiagnosticStep('STYLE OFICIAL COMPLETO', 20000, () => this.probarTerrainStyleCompletoInterna());
      await this.sleep(1500);
      this.setDiagnosticStage('Probando DEM local...', 75);
      await this.runDiagnosticStep('DEM LOCAL', 20000, async () => {
        const baseReady = await this.prepararMapaDiagnosticoBase();
        if (!baseReady) {
          this.setDiagnosticResult({
            test: 'DEM LOCAL',
            status: 'FAIL',
            message: 'Timeout durante preparacion del mapa base antes del DEM local.',
            timeoutStage: 'style',
            styleLoaded: false,
            sourceExists: false,
            sourceLoaded: false,
            idleReached: false,
            terrainSource: null,
            projection: null,
            elevation: null,
          });
          return;
        }

        await this.probarDemLocalAisladoInterna();
      });
      await this.sleep(1500);
      this.setDiagnosticStage('Generando conclusion...', 100);
      this.generarConclusionDiagnostico();
    } catch (error) {
      this.recordDiagnosticError(error);
      this.generarConclusionDiagnostico();
    } finally {
      this.diagnosticRunning = false;
    }
  }

  private async runDiagnosticStep(testName: string, timeoutMs: number, runner: () => Promise<void>): Promise<void> {
    try {
      await this.withTimeout(runner(), timeoutMs, testName);
    } catch (error) {
      this.recordDiagnosticError(error);
      const current = this.demDiagnosticResults.find((entry) => entry.test === testName && entry.status === 'RUNNING');
      if (current) {
        this.setDiagnosticResult({
          ...current,
          status: 'FAIL',
          message: `Timeout durante prueba ${testName}.`,
        });
      }
    }
  }

  public async probarTerrainOficial(): Promise<void> {
    if (this.diagnosticRunning) {
      return;
    }

    this.diagnosticRunning = true;
    try {
      await this.probarTerrainOficialInterna();
    } finally {
      this.diagnosticRunning = false;
    }
  }

  private async probarTerrainOficialInterna(): Promise<void> {
    const testName = 'DEM OFICIAL';
    this.ensureDiagnosticMode();
    console.log('[DEM OFICIAL][1] inicio');
    this.setDiagnosticResult({
      test: testName,
      status: 'RUNNING',
      message: 'Ejecutando DEM oficial de control.',
    });

    const styleLoaded = await this.waitForStyleLoaded(15000);
    if (!this.map || !styleLoaded) {
      this.setDiagnosticResult({
        test: testName,
        status: 'FAIL',
        message: 'El mapa no esta listo o el estilo no esta cargado.',
        timeoutStage: 'style',
        styleLoaded: false,
        sourceExists: false,
      });
      return;
    }

    console.log('[DEM OFICIAL][2] style listo');
    console.trace('[TERRAIN REMOVED]', 'probarTerrainOficialInterna');
    this.map.setTerrain(null);
    this.removeSourceIfExists(this.DEM_CONTROL_SOURCE_ID);

    this.map.setProjection({
      type: 'mercator',
    });

    this.map.addSource(this.DEM_CONTROL_SOURCE_ID, {
      type: 'raster-dem',
      url: environment.map.terrainTileJson,
      tileSize: 256,
    });
    console.log('[DEM OFICIAL][3] source agregado');

    this.map.setTerrain({
      source: this.DEM_CONTROL_SOURCE_ID,
      exaggeration: 1,
    });
    console.log('[DEM OFICIAL][4] terrain aplicado');

    this.map.jumpTo({
      center: [11.39085, 47.27574],
      zoom: 12,
      pitch: 70,
      bearing: 0,
    });
    console.log('[DEM OFICIAL][5] camera aplicada');

    this.map.triggerRepaint();
    console.log('[DEM OFICIAL][6] esperando source');

    const sourceLoaded = await this.waitForSourceLoaded(this.DEM_CONTROL_SOURCE_ID, 10000);
    console.log('[DEM OFICIAL][7] source finalizado', sourceLoaded);
    console.log('[DEM OFICIAL][8] esperando estabilidad');
    const idleReached = await this.waitForMapIdle(8000);
    console.log('[DEM OFICIAL][9] estabilidad terminada', idleReached);
    const elevation = await this.waitForTerrainElevation(10000, 500);
    console.log('[DEM OFICIAL][10] elevation', elevation);

    const result = this.buildTerrainResult(testName, this.DEM_CONTROL_SOURCE_ID, sourceLoaded, false, idleReached, elevation);
    this.setDiagnosticResult(result);
  }

  public async probarTerrainStyleCompleto(): Promise<void> {
    if (this.diagnosticRunning) {
      return;
    }

    this.diagnosticRunning = true;
    try {
      await this.probarTerrainStyleCompletoInterna();
    } finally {
      this.diagnosticRunning = false;
    }
  }

  private async probarTerrainStyleCompletoInterna(): Promise<void> {
    const testName = 'STYLE OFICIAL COMPLETO';
    this.ensureDiagnosticMode();
    this.setDiagnosticResult({
      test: testName,
      status: 'RUNNING',
      message: 'Ejecutando style oficial completo.',
    });

    if (!this.map) {
      this.setDiagnosticResult({
        test: testName,
        status: 'FAIL',
        message: 'No existe instancia de mapa.',
        styleLoaded: false,
        sourceExists: false,
      });
      return;
    }

    console.trace('[TERRAIN REMOVED]', 'probarTerrainStyleCompletoInterna');
    this.map.setTerrain(null);
    console.trace('[STYLE CHANGED]', 'probarTerrainStyleCompletoInterna');
    this.map.setStyle(this.createTerrainControlStyle(), { diff: false });

    const styleLoaded = await this.waitForStyleLoaded(15000);
    if (!styleLoaded) {
      this.setDiagnosticResult({
        test: testName,
        status: 'FAIL',
        message: 'Style oficial no termino de cargar.',
        timeoutStage: 'style',
        styleLoaded: false,
        sourceExists: false,
      });
      return;
    }

    this.map.jumpTo({
      center: [11.39085, 47.27574],
      zoom: 12,
      pitch: 70,
      bearing: 0,
    });

    const sourceLoaded = await this.waitForSourceLoaded('terrainSource', 10000);
    const idleReached = await this.waitForMapIdle(8000);
    const elevation = await this.waitForTerrainElevation(10000, 500);

    const result = this.buildTerrainResult(testName, 'terrainSource', sourceLoaded, false, idleReached, elevation);
    this.setDiagnosticResult(result);
  }

  public async probarDemLocalAislado(): Promise<void> {
    if (this.diagnosticRunning) {
      return;
    }

    this.diagnosticRunning = true;
    try {
      await this.probarDemLocalAisladoInterna();
    } finally {
      this.diagnosticRunning = false;
    }
  }

  private async probarDemLocalAisladoInterna(): Promise<void> {
    const testName = 'DEM LOCAL';
    this.ensureDiagnosticMode();
    this.setDiagnosticResult({
      test: testName,
      status: 'RUNNING',
      message: 'Ejecutando DEM local aislado.',
    });

    const styleLoaded = await this.waitForStyleLoaded(15000);
    if (!this.map || !styleLoaded) {
      this.setDiagnosticResult({
        test: testName,
        status: 'FAIL',
        message: 'El mapa no esta listo o el estilo no esta cargado.',
        timeoutStage: 'style',
        styleLoaded: false,
        sourceExists: false,
      });
      return;
    }

    console.trace('[TERRAIN REMOVED]', 'probarDemLocalAisladoInterna');
    this.map.setTerrain(null);
    this.removeSourceIfExists(this.DEM_LOCAL_TEST_SOURCE_ID);

    this.map.setProjection({
      type: 'mercator',
    });

    this.map.addSource(this.DEM_LOCAL_TEST_SOURCE_ID, {
      type: 'raster-dem',
      tiles: [this.getDemTilesUrl()],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 13,
      bounds: this.DEM_BOUNDS,
      encoding: 'terrarium',
    });

    this.map.setTerrain({
      source: this.DEM_LOCAL_TEST_SOURCE_ID,
      exaggeration: 3,
    });

    this.map.jumpTo({
      center: [-74.05, 4.65],
      zoom: 9,
      pitch: 65,
      bearing: 0,
    });
    this.map.triggerRepaint();

    const sourceLoaded = await this.waitForSourceLoaded(this.DEM_LOCAL_TEST_SOURCE_ID, 10000);
    const idleReached = await this.waitForMapIdle(8000);
    const elevation = await this.waitForTerrainElevation(10000, 500);

    const result = this.buildTerrainResult(testName, this.DEM_LOCAL_TEST_SOURCE_ID, sourceLoaded, true, idleReached, elevation);
    this.setDiagnosticResult(result);
  }

  public async probarDecodificacionTileDem(): Promise<void> {
    if (this.diagnosticRunning) {
      return;
    }

    this.diagnosticRunning = true;
    try {
      await this.probarDecodificacionTileDemInterna();
    } finally {
      this.diagnosticRunning = false;
    }
  }

  private async probarDecodificacionTileDemInterna(): Promise<void> {
    const testName = 'PNG LOCAL BROWSER';
    const tileUrl = this.vulcanoApi.tileUrl(8, 76, 123);
    this.setDiagnosticResult({
      test: testName,
      status: 'RUNNING',
      message: 'Validando PNG Terrarium en el navegador.',
    });

    try {
      const response = await this.vulcanoApi.getResource(tileUrl);
      if (!response.ok) {
        this.setDiagnosticResult({
          test: testName,
          status: 'FAIL',
          message: `HTTP ${response.status}`,
        });
        return;
      }

      const contentType = response.headers.get('content-type') ?? null;
      const blob = await response.blob();
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement('canvas');
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const context = canvas.getContext('2d');

      if (!context) {
        this.setDiagnosticResult({
          test: testName,
          status: 'FAIL',
          message: 'No fue posible crear el contexto 2D.',
        });
        return;
      }

      context.drawImage(bitmap, 0, 0);
      const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      let min = Number.POSITIVE_INFINITY;
      let max = Number.NEGATIVE_INFINITY;
      let sum = 0;
      let count = 0;
      let alphaMin = 255;
      let alphaMax = 0;

      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        const a = data[i + 3];
        const elevation = r * 256 + g + b / 256 - 32768;

        min = Math.min(min, elevation);
        max = Math.max(max, elevation);
        sum += elevation;
        count += 1;
        alphaMin = Math.min(alphaMin, a);
        alphaMax = Math.max(alphaMax, a);
      }

      const meanElevation = count > 0 ? sum / count : null;
      const pass =
        min >= 100 &&
        min <= 150 &&
        max >= 5000 &&
        max <= 5100 &&
        meanElevation !== null &&
        meanElevation >= 1900 &&
        meanElevation <= 2200 &&
        alphaMin === 255 &&
        alphaMax === 255;

      this.setDiagnosticResult({
        test: testName,
        status: pass ? 'PASS' : 'FAIL',
        message: `status=${response.status}; contentType=${contentType}; blobSize=${blob.size}; alphaMin=${alphaMin}; alphaMax=${alphaMax}`,
        minElevation: min,
        maxElevation: max,
        meanElevation,
        alphaMin,
        alphaMax,
        width: canvas.width,
        height: canvas.height,
      });
    } catch (error) {
      this.setDiagnosticResult({
        test: testName,
        status: 'FAIL',
        message: 'Error validando PNG local.',
      });
      this.recordDiagnosticError(error);
    }
  }

  public restaurarMapaNormal(): void {
    if (!this.map) {
      return;
    }

    this.terrainDiagnosticMode = false;
    this.vista3DActiva = false;
    console.trace('[TERRAIN REMOVED]', 'restaurarMapaNormal');
    this.map.setTerrain(null);
    console.trace('[STYLE CHANGED]', 'restaurarMapaNormal');
    this.map.setStyle(this.createStyle());
    this.map.once('style.load', () => {
      if (!this.map) {
        return;
      }

      this.changeBaseMap(this.activeBaseMapId);
      this.configurarDem();
    });
  }

  private imprimirOrdenCapas(): void {
    if (!this.map) {
      return;
    }

    console.table(
      this.map.getStyle().layers?.map((layer, index) => ({
        index,
        id: layer.id,
        type: layer.type,
        source: 'source' in layer ? layer.source : null,
      })),
    );
  }

  private isMapContainerVisible(): boolean {
    const container = this.mapContainer?.nativeElement;
    return !!container && container.clientWidth > 0 && container.clientHeight > 0;
  }

  private logWebGlInfo(): void {
    if (!this.DEBUG_MAP) {
      return;
    }

    const canvas = document.createElement('canvas');
    const context =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl');

    if (!context) {
      console.log('[WEBGL TEST]', {
        webgl: false,
        webgl2: false,
        renderer: null,
        vendor: null,
        version: null,
        maxTextureSize: null,
      });
      return;
    }

    const gl = context as WebGLRenderingContext | WebGL2RenderingContext;
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info') as
      | { UNMASKED_RENDERER_WEBGL: number; UNMASKED_VENDOR_WEBGL: number }
      | null;

    console.log('[WEBGL TEST]', {
      webgl: !!canvas.getContext('webgl'),
      webgl2: !!canvas.getContext('webgl2'),
      renderer: debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : null,
      vendor: debugInfo ? gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) : null,
      version: gl.getParameter(gl.VERSION),
      maxTextureSize: gl.getParameter(gl.MAX_TEXTURE_SIZE),
    });
  }

  private logMapCanvasInfo(label: string): void {
    if (!this.DEBUG_MAP) {
      return;
    }

    const container = this.mapContainer?.nativeElement;
    const canvas = this.map?.getCanvas();

    console.log(label, {
      containerClientWidth: container?.clientWidth ?? null,
      containerClientHeight: container?.clientHeight ?? null,
      canvasWidth: canvas?.width ?? null,
      canvasHeight: canvas?.height ?? null,
      devicePixelRatio: window.devicePixelRatio,
    });
  }

  private logPitch(origen: string): void {
    if (!this.DEBUG_MAP) {
      return;
    }

    console.log(`[PITCH] ${origen}`, {
      inputPitch: this.pitch,
      mapPitch: this.map?.getPitch() ?? null,
      vista3DActiva: this.vista3DActiva,
      terrainDiagnosticMode: this.terrainDiagnosticMode,
    });
  }

  private createTerrainControlStyle(): StyleSpecification {
    return {
      version: 8,
      projection: {
        type: 'mercator',
      },
      sources: {
        osm: {
          ...this.createBaseMapSourceSpecification(this.DEFAULT_BASE_MAP_ID),
          type: 'raster',
          attribution: this.baseMaps[this.DEFAULT_BASE_MAP_ID].attribution,
          tileSize: 256,
          maxzoom: 19,
        },
        terrainSource: {
          type: 'raster-dem',
          url: environment.map.terrainTileJson,
          tileSize: 256,
        },
      },
      layers: [
        {
          id: 'osm',
          type: 'raster',
          source: 'osm',
        },
      ],
      terrain: {
        source: 'terrainSource',
        exaggeration: 1,
      },
    };
  }

  private ensureDiagnosticMode(): void {
    this.terrainDiagnosticMode = true;
  }

  private resetDiagnosticSession(): void {
    this.ensureDiagnosticMode();
    this.demDiagnosticFinished = false;
    this.demDiagnosticCurrentStage = 'Diagnostico en ejecucion.';
    this.demDiagnosticProgress = 0;
    this.diagnosticSourceDataCount = 0;
    this.demDiagnosticResults = [];
    this.diagnosticErrors = [];
    this.demDiagnosticConclusion = '';
    this.updateDiagnosticOutput();
  }

  private setDiagnosticResult(result: DemDiagnosticResult): void {
    const index = this.demDiagnosticResults.findIndex((entry) => entry.test === result.test);
    if (index >= 0) {
      this.demDiagnosticResults[index] = result;
    } else {
      this.demDiagnosticResults.push(result);
    }

    this.updateDiagnosticOutput();
  }

  private recordDiagnosticError(error: unknown): void {
    const normalized =
      typeof error === 'string'
        ? error
        : error instanceof Error
          ? JSON.stringify({
              message: error.message,
              stack: error.stack ?? null,
            })
          : (() => {
              try {
                return JSON.stringify(error);
              } catch {
                return String(error);
              }
            })();

    this.diagnosticErrors.push(normalized);
    this.updateDiagnosticOutput();
  }

  private updateDiagnosticOutput(): void {
    this.demDiagnosticConclusion = this.evaluateDiagnosticConclusion();
    this.demDiagnosticText = JSON.stringify(
      {
        finished: this.demDiagnosticFinished,
        timestamp: new Date().toISOString(),
        currentStage: this.demDiagnosticCurrentStage,
        progress: this.demDiagnosticProgress,
        conclusion: this.demDiagnosticConclusion,
        errors: this.diagnosticErrors,
        results: this.demDiagnosticResults,
      },
      null,
      2,
    );
  }

  private resetBaselineDiagnosticSession(): void {
    this.baselineDiagnosticFinished = false;
    this.baselineDiagnosticCurrentStage = 'Baseline pendiente.';
    this.baselineDiagnosticProgress = 0;
    this.baselineDiagnosticResults = [];
    this.baselineDiagnosticErrors = [];
    this.baselineDiagnosticConclusion = '';
    this.baselineSourceEvents = [];
    this.updateBaselineDiagnosticOutput();
  }

  private setBaselineDiagnosticStage(stage: string, progress: number): void {
    this.baselineDiagnosticCurrentStage = stage;
    this.baselineDiagnosticProgress = progress;
    this.updateBaselineDiagnosticOutput();
  }

  private setBaselineDiagnosticResult(result: DemDiagnosticResult): void {
    const index = this.baselineDiagnosticResults.findIndex((entry) => entry.test === result.test);
    if (index >= 0) {
      this.baselineDiagnosticResults[index] = result;
    } else {
      this.baselineDiagnosticResults.push(result);
    }

    this.updateBaselineDiagnosticOutput();
  }

  private recordBaselineDiagnosticError(error: unknown): void {
    const normalized =
      typeof error === 'string'
        ? error
        : error instanceof Error
          ? JSON.stringify({
              message: error.message,
              stack: error.stack ?? null,
            })
          : (() => {
              try {
                return JSON.stringify(error);
              } catch {
                return String(error);
              }
            })();

    this.baselineDiagnosticErrors.push(normalized);
    this.updateBaselineDiagnosticOutput();
  }

  private updateBaselineDiagnosticOutput(): void {
    this.baselineDiagnosticConclusion = this.evaluateBaselineDiagnosticConclusion();
    this.baselineDiagnosticText = JSON.stringify(
      {
        finished: this.baselineDiagnosticFinished,
        timestamp: new Date().toISOString(),
        currentStage: this.baselineDiagnosticCurrentStage,
        progress: this.baselineDiagnosticProgress,
        conclusion: this.baselineDiagnosticConclusion,
        errors: this.baselineDiagnosticErrors,
        results: this.baselineDiagnosticResults,
        sourceEvents: this.baselineSourceEvents,
      },
      null,
      2,
    );
  }

  private evaluateBaselineDiagnosticConclusion(): string {
    const official = this.baselineDiagnosticResults.find((entry) => entry.test === 'BASELINE OFICIAL');
    const local = this.baselineDiagnosticResults.find((entry) => entry.test === 'BASELINE LOCAL');

    if (official?.status === 'PASS' && local?.status === 'PASS') {
      return 'El baseline oficial y el baseline local funcionan aislados. El problema queda en el flujo normal de Vulcano.';
    }

    if (official?.status === 'PASS' && local?.status === 'FAIL') {
      return 'El baseline oficial funciona y el baseline local falla. La diferencia esta en la fuente DEM local.';
    }

    if (official?.status === 'FAIL' && local?.status === 'PASS') {
      return 'El baseline oficial falla y el local pasa, lo cual indica una diferencia de configuracion entre ambas fuentes.';
    }

    if (official?.status === 'FAIL' && local?.status === 'FAIL') {
      return 'El ejemplo oficial tampoco funciona de forma aislada. La causa es MapLibre/style/WebGL/configuracion del baseline.';
    }

    return 'Baseline en ejecucion.';
  }

  private evaluateDiagnosticConclusion(): string {
    const png = this.demDiagnosticResults.find((entry) => entry.test === 'PNG LOCAL BROWSER');
    const control = this.demDiagnosticResults.find((entry) => entry.test === 'DEM OFICIAL');
    const style = this.demDiagnosticResults.find((entry) => entry.test === 'STYLE OFICIAL COMPLETO');
    const local = this.demDiagnosticResults.find((entry) => entry.test === 'DEM LOCAL');

    if (png?.status === 'FAIL') {
      return 'El fallo ocurre entre HTTP y la decodificacion del PNG en el navegador.';
    }

    if (control?.status === 'FAIL' && style?.status === 'FAIL') {
      return 'La instancia MapLibre/WebGL o la configuracion global no esta renderizando terrain correctamente.';
    }

    if (control?.status === 'PASS' && local?.status === 'FAIL' && png?.status === 'PASS') {
      return 'El navegador recibe correctamente el Terrarium y MapLibre terrain funciona con la fuente de control. El fallo es especifico del DEM local.';
    }

    if (control?.status === 'PASS' && local?.status === 'PASS' && png?.status === 'PASS') {
      return 'Terrain funciona en el harness aislado. El fallo esta en el flujo normal de Vulcano.';
    }

    if (style?.status === 'PASS' && control?.status === 'FAIL') {
      return 'El problema esta en el flujo dinamico style vacio + addSource + setTerrain.';
    }

    if (control?.status === 'PASS' && style?.status === 'PASS' && local?.status === 'PASS') {
      return 'Terrain funciona en el harness aislado y el DEM local tambien responde correctamente.';
    }

    return 'Diagnostico en ejecucion.';
  }

  private setDiagnosticStage(stage: string, progress: number): void {
    this.demDiagnosticCurrentStage = stage;
    this.demDiagnosticProgress = progress;
    this.updateDiagnosticOutput();
  }

  private generarConclusionDiagnostico(): void {
    this.demDiagnosticFinished = true;
    this.demDiagnosticCurrentStage = 'Diagnostico terminado.';
    this.demDiagnosticProgress = 100;

    this.demDiagnosticResults = this.demDiagnosticResults.map((result) => {
      if (result.status !== 'RUNNING') {
        return result;
      }

      return {
        ...result,
        status: 'FAIL',
        message: 'La prueba no finalizo correctamente.',
      };
    });

    this.demDiagnosticConclusion = this.evaluateDiagnosticConclusion();
    this.updateDiagnosticOutput();
  }

  public async copiarResultado(): Promise<void> {
    if (!navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(this.demDiagnosticText);
  }

  public async copiarBaselineResultado(): Promise<void> {
    if (!navigator.clipboard) {
      return;
    }

    await navigator.clipboard.writeText(this.baselineDiagnosticText);
  }

  public mostrarBaselineDiagnostic(): void {
    this.baselineDiagnosticVisible = true;
  }

  public cerrarBaselineDiagnostic(): void {
    this.destroyBaselineMap();
    this.baselineDiagnosticVisible = false;
    this.resetBaselineDiagnosticSession();
  }

  public isBaselineDiagnosticActive(): boolean {
    return this.baselineDiagnosticVisible;
  }

  public probarBaselineMapLibre(): void {
    void this.ejecutarBaselineMapLibreOficial();
  }

  public probarBaselineLocalMapLibre(): void {
    void this.ejecutarBaselineMapLibreLocal();
  }

  public async ejecutarBaselineMapLibreCompleto(): Promise<void> {
    if (this.baselineDiagnosticRunning) {
      return;
    }

    this.baselineDiagnosticRunning = true;
    this.baselineDiagnosticVisible = true;
    try {
      this.resetBaselineDiagnosticSession();
      this.setBaselineDiagnosticStage('Validando control oficial...', 0);
      await this.ejecutarBaselineMapLibreOficial();
      const official = this.baselineDiagnosticResults.find((entry) => entry.test === 'BASELINE OFICIAL');

      if (official?.status !== 'PASS') {
        this.setBaselineDiagnosticStage('Baseline terminado.', 100);
        this.baselineDiagnosticFinished = true;
        this.updateBaselineDiagnosticOutput();
        return;
      }

      this.setBaselineDiagnosticStage('Validando control local...', 50);
      await this.ejecutarBaselineMapLibreLocal();
      this.setBaselineDiagnosticStage('Generando conclusion...', 100);
      this.baselineDiagnosticFinished = true;
      this.updateBaselineDiagnosticOutput();
    } catch (error) {
      this.recordBaselineDiagnosticError(error);
      this.baselineDiagnosticFinished = true;
      this.updateBaselineDiagnosticOutput();
    } finally {
      this.baselineDiagnosticRunning = false;
    }
  }

  private async ejecutarBaselineMapLibreOficial(): Promise<void> {
    const testName = 'BASELINE OFICIAL';
    this.baselineDiagnosticVisible = true;
    this.setBaselineDiagnosticResult({
      test: testName,
      phase: 'official',
      status: 'RUNNING',
      message: 'Ejecutando baseline oficial minimo MapLibre 6.3.0.',
      loadReceived: false,
      styleLoaded: false,
      sourceExists: false,
      hillshadeSourceExists: false,
      sourceLoaded: false,
      idleReached: false,
      terrainSource: null,
      elevation: null,
    });

    const tileJson = await this.fetchTileJson(environment.map.terrainTileJson);
    console.log('[CONTROL TILEJSON DATA]', tileJson.data);
    this.setBaselineDiagnosticResult({
      test: 'CONTROL TILEJSON',
      phase: 'official',
      status: tileJson.ok ? 'PASS' : 'FAIL',
      message: tileJson.ok
        ? `status=${tileJson.status}; contentType=${tileJson.contentType}; tiles=${(tileJson.data?.tiles ?? []).join(' | ') || 'n/a'}; minzoom=${tileJson.data?.minzoom ?? 'n/a'}; maxzoom=${tileJson.data?.maxzoom ?? 'n/a'}; bounds=${tileJson.data?.bounds?.join(',') ?? 'n/a'}; scheme=${tileJson.data?.scheme ?? 'n/a'}`
        : 'CONTROL TILEJSON NETWORK FAIL',
      tileJsonOk: tileJson.ok,
      tileJsonStatus: tileJson.status,
      tileJsonContentType: tileJson.contentType,
      loadReceived: false,
      styleLoaded: false,
      sourceExists: false,
      hillshadeSourceExists: false,
      sourceLoaded: false,
      idleReached: false,
      terrainSource: null,
      elevation: null,
    });

    if (tileJson.ok) {
      const firstTileUrl = this.resolveTileJsonTemplateUrl(tileJson.data?.tiles?.[0] ?? null, 12, 2074, 1500);
      if (firstTileUrl) {
        const demProbe = await this.fetchBinaryHttpProbe(firstTileUrl, 'CONTROL DEM TILE HTTP');
        this.setBaselineDiagnosticResult({
          test: 'CONTROL DEM TILE HTTP',
          phase: 'official',
          status: demProbe.ok ? 'PASS' : 'FAIL',
          message: `status=${demProbe.status}; contentType=${demProbe.contentType}; blobSize=${demProbe.blobSize}`,
          loadReceived: false,
          styleLoaded: false,
          sourceExists: false,
          hillshadeSourceExists: false,
          sourceLoaded: false,
          idleReached: false,
          terrainSource: null,
          elevation: null,
        });
      }
    }

    const osmProbe = this.cartography.isEnabled('streets')
      ? await this.fetchBinaryHttpProbe(environment.map.osmProbe, 'OSM CONTROL HTTP')
      : { ok: false, status: 0, contentType: 'disabled', blobSize: 0 };
    this.setBaselineDiagnosticResult({
      test: 'OSM CONTROL HTTP',
      phase: 'official',
      status: osmProbe.ok ? 'PASS' : 'FAIL',
      message: `status=${osmProbe.status}; contentType=${osmProbe.contentType}; blobSize=${osmProbe.blobSize}`,
      loadReceived: false,
      styleLoaded: false,
      sourceExists: false,
      hillshadeSourceExists: false,
      sourceLoaded: false,
      idleReached: false,
      terrainSource: null,
      elevation: null,
    });

    if (!tileJson.ok) {
      return;
    }

    const { map, loadReceived } = await this.createBaselineMap(this.createBaselineOfficialMinimalStyle(), {
      center: [11.39085, 47.27574],
      zoom: 12,
      pitch: 70,
      bearing: 0,
    });

    if (!map) {
      this.setBaselineDiagnosticResult({
        test: testName,
        phase: 'official',
        status: 'FAIL',
        message: 'No fue posible crear el mapa baseline oficial.',
        tileJsonOk: true,
        tileJsonStatus: tileJson.status,
        tileJsonContentType: tileJson.contentType,
        tileJsonTiles: tileJson.data?.tiles,
        tileJsonMinzoom: tileJson.data?.minzoom ?? null,
        tileJsonMaxzoom: tileJson.data?.maxzoom ?? null,
        tileJsonBounds: tileJson.data?.bounds ?? null,
        tileJsonScheme: tileJson.data?.scheme ?? null,
        loadReceived: false,
        styleLoaded: false,
        sourceExists: false,
        hillshadeSourceExists: false,
        sourceLoaded: false,
        idleReached: false,
        terrainSource: null,
        elevation: null,
      });
      return;
    }

    if (!loadReceived) {
      this.setBaselineDiagnosticResult({
        test: testName,
        phase: 'official',
        status: 'FAIL',
        message: 'Timeout esperando load del baseline oficial.',
        tileJsonOk: true,
        tileJsonStatus: tileJson.status,
        tileJsonContentType: tileJson.contentType,
        tileJsonTiles: tileJson.data?.tiles,
        tileJsonMinzoom: tileJson.data?.minzoom ?? null,
        tileJsonMaxzoom: tileJson.data?.maxzoom ?? null,
        tileJsonBounds: tileJson.data?.bounds ?? null,
        tileJsonScheme: tileJson.data?.scheme ?? null,
        loadReceived: false,
        styleLoaded: map.isStyleLoaded() === true,
        sourceExists: !!map.getSource('terrainSource'),
        hillshadeSourceExists: !!map.getSource('hillshadeSource'),
        sourceLoaded: false,
        idleReached: false,
        terrainSource: map.getTerrain()?.source ?? null,
        elevation: null,
      });
      return;
    }

    await this.sleep(3000);
    this.logBaselineState(map, testName);
    const sourceExists = !!map.getSource('terrainSource');
    const hillshadeSourceExists = !!map.getSource('hillshadeSource');
    const terrain = map.getTerrain();
      const sourceLoaded = this.safeIsSourceLoaded('terrainSource', map);
      const hillshadeLoaded = this.safeIsSourceLoaded('hillshadeSource', map);
    const idleReached = await this.waitForMapIdle(8000, map);
    const elevation = map.queryTerrainElevation(map.getCenter());
    const terrainSource = map.getTerrain()?.source ?? null;

    this.setBaselineDiagnosticResult({
      test: testName,
      phase: 'official',
      status: loadReceived && sourceExists && terrainSource === 'terrainSource' && typeof elevation === 'number' ? 'PASS' : 'FAIL',
      message: `loadReceived=${loadReceived}; sourceExists=${sourceExists}; sourceLoaded=${sourceLoaded}; hillshadeSourceExists=${hillshadeSourceExists}; hillshadeLoaded=${hillshadeLoaded}; terrain=${!!terrain}; terrainSource=${terrainSource}; elevation=${elevation}`,
      loadReceived,
      styleLoaded: map.isStyleLoaded() === true,
      sourceExists,
      hillshadeSourceExists,
      sourceLoaded,
      idleReached,
      terrainSource,
      elevation,
      tileJsonOk: tileJson.ok,
      tileJsonStatus: tileJson.status,
      tileJsonContentType: tileJson.contentType,
      tileJsonTiles: tileJson.data?.tiles,
      tileJsonMinzoom: tileJson.data?.minzoom ?? null,
      tileJsonMaxzoom: tileJson.data?.maxzoom ?? null,
      tileJsonBounds: tileJson.data?.bounds ?? null,
      tileJsonScheme: tileJson.data?.scheme ?? null,
      projection: (() => {
        const projection = map.getProjection?.();
        return projection?.type ? String(projection.type) : null;
      })(),
      width: map.getCanvas().width,
      height: map.getCanvas().height,
    });
  }

  private async ejecutarBaselineMapLibreLocal(): Promise<void> {
    const testName = 'BASELINE LOCAL';
    this.baselineDiagnosticVisible = true;
    this.setBaselineDiagnosticResult({
      test: testName,
      phase: 'local',
      status: 'RUNNING',
      message: 'Ejecutando baseline local minimo MapLibre 6.3.0.',
      loadReceived: false,
      styleLoaded: false,
      sourceExists: false,
      hillshadeSourceExists: false,
      sourceLoaded: false,
      idleReached: false,
      terrainSource: null,
      elevation: null,
    });

    const { map, loadReceived } = await this.createBaselineMap(this.createBaselineLocalMinimalStyle(), {
      center: [-74.05, 4.65],
      zoom: 9,
      pitch: 65,
      bearing: 0,
    });

    if (!map) {
      this.setBaselineDiagnosticResult({
        test: testName,
        phase: 'local',
        status: 'FAIL',
        message: 'No fue posible crear el mapa baseline local.',
        loadReceived: false,
        styleLoaded: false,
        sourceExists: false,
        hillshadeSourceExists: false,
        sourceLoaded: false,
        idleReached: false,
        terrainSource: null,
        elevation: null,
      });
      return;
    }

    if (!loadReceived) {
      this.setBaselineDiagnosticResult({
        test: testName,
        phase: 'local',
        status: 'FAIL',
        message: 'Timeout esperando load del baseline local.',
        loadReceived: false,
        styleLoaded: map.isStyleLoaded() === true,
        sourceExists: !!map.getSource('terrainSource'),
        hillshadeSourceExists: !!map.getSource('hillshadeSource'),
        sourceLoaded: false,
        idleReached: false,
        terrainSource: map.getTerrain()?.source ?? null,
        elevation: null,
      });
      return;
    }

    await this.sleep(3000);
    this.logBaselineState(map, testName);
    const sourceExists = !!map.getSource('terrainSource');
    const hillshadeSourceExists = !!map.getSource('hillshadeSource');
    const terrain = map.getTerrain();
    const sourceLoaded = this.safeIsSourceLoaded('terrainSource', map);
    const hillshadeLoaded = this.safeIsSourceLoaded('hillshadeSource', map);
    const idleReached = await this.waitForMapIdle(8000, map);
    const elevation = map.queryTerrainElevation(map.getCenter());
    const terrainSource = map.getTerrain()?.source ?? null;

    this.setBaselineDiagnosticResult({
      test: testName,
      phase: 'local',
      status: loadReceived && sourceExists && terrainSource === 'terrainSource' && typeof elevation === 'number' ? 'PASS' : 'FAIL',
      message: `loadReceived=${loadReceived}; sourceExists=${sourceExists}; sourceLoaded=${sourceLoaded}; hillshadeSourceExists=${hillshadeSourceExists}; hillshadeLoaded=${hillshadeLoaded}; terrain=${!!terrain}; terrainSource=${terrainSource}; elevation=${elevation}`,
      loadReceived,
      styleLoaded: map.isStyleLoaded() === true,
      sourceExists,
      hillshadeSourceExists,
      sourceLoaded,
      idleReached,
      terrainSource,
      elevation,
      projection: (() => {
        const projection = map.getProjection?.();
        return projection?.type ? String(projection.type) : null;
      })(),
      width: map.getCanvas().width,
      height: map.getCanvas().height,
    });
  }

  private async createBaselineMap(
    style: StyleSpecification,
    options?: {
      center?: [number, number];
      zoom?: number;
      pitch?: number;
      bearing?: number;
    },
  ): Promise<{
    map: MapLibreMap | null;
    loadReceived: boolean;
  }> {
    const container = this.terrainBaselineContainer?.nativeElement;
    if (!container) {
      this.recordBaselineDiagnosticError('No existe contenedor baseline.');
      return {
        map: null,
        loadReceived: false,
      };
    }

    this.destroyBaselineMap();

    console.log('[BASELINE CONTAINER]', {
      width: container.clientWidth,
      height: container.clientHeight,
    });

    if (container.clientWidth <= 0 || container.clientHeight <= 0) {
      this.recordBaselineDiagnosticError('El contenedor baseline no tiene dimensiones.');
      return {
        map: null,
        loadReceived: false,
      };
    }

    let map: MapLibreMap;

    try {
      map = new maplibregl.Map({
        container,
        style,
        center: options?.center ?? [11.39085, 47.27574],
        zoom: options?.zoom ?? 12,
        pitch: options?.pitch ?? 70,
        bearing: options?.bearing ?? 0,
        maxZoom: 18,
        maxPitch: 85,
        canvasContextAttributes: {
          antialias: true,
        },
      });
    } catch (error) {
      this.recordBaselineDiagnosticError(error);
      return {
        map: null,
        loadReceived: false,
      };
    }

    this.baselineMap = map;

    map.on('error', this.handleBaselineMapError);
    map.on('sourcedata', this.handleBaselineSourceData);

    map.addControl(
      new maplibregl.NavigationControl({
        visualizePitch: true,
        showZoom: true,
        showCompass: true,
      }),
    );

    const loadReceived = await new Promise<boolean>((resolve) => {
      let finished = false;
      const timeout = window.setTimeout(() => {
        if (finished) {
          return;
        }

        finished = true;
        map.off('load', onLoad);
        resolve(false);
      }, 20000);

      const onLoad = (): void => {
        if (finished) {
          return;
        }

        finished = true;
        window.clearTimeout(timeout);
        map.off('load', onLoad);
        console.log('[BASELINE] load recibido');
        resolve(true);
      };

      map.on('load', onLoad);
    });

    return {
      map,
      loadReceived,
    };
  }

  private destroyBaselineMap(): void {
    if (!this.baselineMap) {
      return;
    }

    this.baselineMap.off('error', this.handleBaselineMapError);
    this.baselineMap.off('sourcedata', this.handleBaselineSourceData);
    this.baselineMap.remove();
    this.baselineMap = null;
  }

  private readonly handleBaselineMapError = (event: unknown): void => {
    const error = this.extractErrorDetail(event);
    this.recordBaselineDiagnosticError(error);
  };

  private readonly handleBaselineSourceData = (event: {
    sourceId?: string;
    sourceDataType?: string;
    isSourceLoaded?: boolean;
  }): void => {
    if (this.baselineSourceEvents.length < 20) {
      this.baselineSourceEvents.push({
        sourceId: event.sourceId,
        sourceDataType: event.sourceDataType,
        isSourceLoaded: event.isSourceLoaded,
      });
      this.updateBaselineDiagnosticOutput();
    }
  };

  private async fetchTileJson(url: string): Promise<{
    ok: boolean;
    status: number;
    contentType: string | null;
    data: {
      tiles?: string[];
      minzoom?: number;
      maxzoom?: number;
      bounds?: number[];
      scheme?: string;
    } | null;
  }> {
    try {
      const response = await this.vulcanoApi.getResource(url);
      const contentType = response.headers.get('content-type');
      const data = response.ok ? ((await response.json()) as {
        tiles?: string[];
        minzoom?: number;
        maxzoom?: number;
        bounds?: number[];
        scheme?: string;
      }) : null;

      return {
        ok: response.ok,
        status: response.status,
        contentType,
        data,
      };
    } catch {
      return {
        ok: false,
        status: 0,
        contentType: null,
        data: null,
      };
    }
  }

  private async fetchBinaryHttpProbe(url: string, label: string): Promise<{
    ok: boolean;
    status: number;
    contentType: string | null;
    blobSize: number | null;
  }> {
    if (url === environment.map.osmProbe && !this.cartography.isEnabled('streets')) {
      return { ok: false, status: 0, contentType: 'disabled', blobSize: null };
    }
    try {
      // OSM usa la cache HTTP normal del navegador; no pasa por el no-store del diagnostico DEM.
      // No cambia identidad, cabeceras ni proveedor ante un bloqueo.
      const response = url === environment.map.osmProbe
        ? await fetch(url)
        : await this.vulcanoApi.getResource(url);
      const contentType = response.headers.get('content-type');
      const blob = await response.blob();
      const result = {
        ok: response.ok,
        status: response.status,
        contentType,
        blobSize: blob.size,
      };
      console.log(`[${label}]`, result);
      return result;
    } catch (error) {
      console.log(`[${label}]`, error);
      return {
        ok: false,
        status: 0,
        contentType: null,
        blobSize: null,
      };
    }
  }

  private resolveTileJsonTemplateUrl(template: string | null, zoom: number, lng: number, lat: number): string | null {
    if (!template) {
      return null;
    }

    const { x, y } = this.lngLatToTile(lng, lat, zoom);
    return template
      .replace('{z}', String(zoom))
      .replace('{x}', String(x))
      .replace('{y}', String(y));
  }

  private lngLatToTile(lng: number, lat: number, zoom: number): { x: number; y: number } {
    const scale = 2 ** zoom;
    const x = Math.floor(((lng + 180) / 360) * scale);
    const latRad = (lat * Math.PI) / 180;
    const y = Math.floor(
      ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale,
    );

    return { x, y };
  }

  private logBaselineState(map: MapLibreMap, label: string): void {
    console.log('[BASELINE STATE]', label, {
      loaded: map.loaded(),
      styleLoaded: map.isStyleLoaded(),
      terrain: map.getTerrain(),
      projection: map.getProjection(),
      center: map.getCenter(),
      zoom: map.getZoom(),
      pitch: map.getPitch(),
    });
  }

  private createBaselineStyle(options: {
    terrainSource: StyleSpecification['sources'][string];
    hillshadeSource?: StyleSpecification['sources'][string] | null;
    includeHillshade: boolean;
    includeSky: boolean;
    terrainExaggeration: number;
  }): StyleSpecification {
    const sources: Record<string, unknown> = {
      osm: {
        ...this.createBaseMapSourceSpecification(this.DEFAULT_BASE_MAP_ID),
        type: 'raster',
        tileSize: 256,
        attribution: this.baseMaps[this.DEFAULT_BASE_MAP_ID].attribution,
        maxzoom: 19,
      },
      terrainSource: options.terrainSource,
    };

    if (options.includeHillshade) {
      sources['hillshadeSource'] = options.hillshadeSource ?? options.terrainSource;
    }

    const layers: Array<Record<string, unknown>> = [
      {
        id: 'osm',
        type: 'raster',
        source: 'osm',
      },
    ];

    if (options.includeHillshade) {
      layers.push({
        id: 'hills',
        type: 'hillshade',
        source: 'hillshadeSource',
        layout: {
          visibility: 'visible',
        },
        paint: {
          'hillshade-shadow-color': '#473B24',
        },
      });
    }

    const style: StyleSpecification = {
      version: 8,
      sources: sources as StyleSpecification['sources'],
      layers: layers as StyleSpecification['layers'],
      terrain: {
        source: 'terrainSource',
        exaggeration: options.terrainExaggeration,
      },
    };

    if (options.includeSky) {
      (style as StyleSpecification & { sky?: Record<string, unknown> }).sky = {};
    }

    return style;
  }

  private createBaselineOfficialMinimalStyle(): StyleSpecification {
    return this.createBaselineStyle({
      terrainSource: {
        type: 'raster-dem',
        url: environment.map.terrainTileJson,
      },
      includeHillshade: false,
      includeSky: false,
      terrainExaggeration: 1,
    });
  }

  private createBaselineOfficialHillshadeStyle(): StyleSpecification {
    return this.createBaselineStyle({
      terrainSource: {
        type: 'raster-dem',
        url: environment.map.terrainTileJson,
      },
      hillshadeSource: {
        type: 'raster-dem',
        url: environment.map.terrainTileJson,
      },
      includeHillshade: true,
      includeSky: false,
      terrainExaggeration: 1,
    });
  }

  private createBaselineOfficialSkyStyle(): StyleSpecification {
    return this.createBaselineStyle({
      terrainSource: {
        type: 'raster-dem',
        url: environment.map.terrainTileJson,
      },
      hillshadeSource: {
        type: 'raster-dem',
        url: environment.map.terrainTileJson,
      },
      includeHillshade: true,
      includeSky: true,
      terrainExaggeration: 1,
    });
  }

  private createBaselineLocalMinimalStyle(): StyleSpecification {
    const tiles = [this.vulcanoApi.tilesUrl];

    return this.createBaselineStyle({
      terrainSource: {
        type: 'raster-dem',
        tiles,
        tileSize: 256,
        encoding: 'terrarium',
        minzoom: 0,
        maxzoom: 13,
        bounds: this.DEM_BOUNDS,
      },
      includeHillshade: false,
      includeSky: false,
      terrainExaggeration: 2,
    });
  }

  private createBaselineLocalHillshadeStyle(): StyleSpecification {
    const tiles = [this.vulcanoApi.tilesUrl];

    return this.createBaselineStyle({
      terrainSource: {
        type: 'raster-dem',
        tiles,
        tileSize: 256,
        encoding: 'terrarium',
        minzoom: 0,
        maxzoom: 13,
        bounds: this.DEM_BOUNDS,
      },
      hillshadeSource: {
        type: 'raster-dem',
        tiles,
        tileSize: 256,
        encoding: 'terrarium',
        minzoom: 0,
        maxzoom: 13,
        bounds: this.DEM_BOUNDS,
      },
      includeHillshade: true,
      includeSky: false,
      terrainExaggeration: 2,
    });
  }

  private async waitForMapLoadEvent(map: MapLibreMap, timeoutMs = 15000): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        map.off('load', handler);
        resolve(false);
      }, timeoutMs);

      const handler = (): void => {
        if (settled) {
          return;
        }

        settled = true;
        window.clearTimeout(timeoutId);
        map.off('load', handler);
        resolve(true);
      };

      map.on('load', handler);
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, ms));
  }

  private pause(ms: number): Promise<void> {
    return this.sleep(ms);
  }

  private waitForSourceLoaded(
    sourceId: string,
    timeoutMs = 10000,
    map: MapLibreMap | null = this.map,
  ): Promise<boolean> {
    if (!map) {
      return Promise.resolve(false);
    }

    if (this.safeIsSourceLoaded(sourceId, map)) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        map.off('sourcedata', handler);
        resolve(false);
      }, timeoutMs);

      const handler = (event: { sourceId?: string; isSourceLoaded?: boolean }): void => {
        if (settled || event.sourceId !== sourceId || !event.isSourceLoaded) {
          return;
        }

        settled = true;
        window.clearTimeout(timeoutId);
        map.off('sourcedata', handler);
        resolve(true);
      };

      map.on('sourcedata', handler);
    });
  }

  private waitForMapIdle(timeoutMs = 8000, map: MapLibreMap | null = this.map): Promise<boolean> {
    if (!map) {
      return Promise.resolve(false);
    }

    return new Promise((resolve) => {
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        map.off('idle', handler);
        resolve(false);
      }, timeoutMs);

      const handler = (): void => {
        if (settled) {
          return;
        }

        settled = true;
        window.clearTimeout(timeoutId);
        map.off('idle', handler);
        resolve(true);
      };

      map.on('idle', handler);
    });
  }

  private async waitForTerrainElevation(
    timeoutMs = 10000,
    intervalMs = 500,
    map: MapLibreMap | null = this.map,
  ): Promise<number | null> {
    if (!map) {
      return null;
    }

    const deadline = Date.now() + timeoutMs;
    let lastValue: number | null = null;

    while (Date.now() < deadline) {
      const center = map.getCenter();
      const elevation =
        typeof map.queryTerrainElevation === 'function'
          ? map.queryTerrainElevation([center.lng, center.lat])
          : null;

      if (typeof elevation === 'number' && Number.isFinite(elevation) && Math.abs(elevation) > 0.1) {
        return elevation;
      }

      if (typeof elevation === 'number' && Number.isFinite(elevation)) {
        lastValue = elevation;
      }

      await this.sleep(intervalMs);
    }

    return lastValue;
  }

  private withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = window.setTimeout(() => {
        reject(new Error(`Timeout ${label}`));
      }, timeoutMs);

      promise
        .then((value) => {
          window.clearTimeout(timeoutId);
          resolve(value);
        })
        .catch((error) => {
          window.clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  private waitForStyleLoaded(
    timeoutMs = 15000,
    map: MapLibreMap | null = this.map,
  ): Promise<boolean> {
    if (!map) {
      return Promise.resolve(false);
    }

    if (map.isStyleLoaded()) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      let settled = false;
      const timeoutId = window.setTimeout(() => {
        if (settled) {
          return;
        }

        settled = true;
        map.off('style.load', handler);
        resolve(false);
      }, timeoutMs);

      const handler = (): void => {
        if (settled) {
          return;
        }

        settled = true;
        window.clearTimeout(timeoutId);
        map.off('style.load', handler);
        resolve(true);
      };

      map.on('style.load', handler);
    });
  }

  private async prepararMapaDiagnosticoBase(): Promise<boolean> {
    const map = this.map;
    if (!map) {
      return false;
    }

    console.trace('[TERRAIN REMOVED]', 'prepararMapaDiagnosticoBase');
    map.setTerrain(null);
    console.trace('[STYLE CHANGED]', 'prepararMapaDiagnosticoBase');
    map.setStyle(this.createStyle(), { diff: false });

    const styleLoaded = await this.waitForStyleLoaded(15000);
    if (!styleLoaded) {
      this.recordDiagnosticError('Timeout esperando el style base del diagnostico.');
      return false;
    }

    map.setProjection({
      type: 'mercator',
    });

    return true;
  }

  private removeSourceIfExists(sourceId: string): void {
    if (!this.map || !this.map.getSource(sourceId)) {
      return;
    }

    if (this.map.getTerrain()?.source === sourceId) {
      console.trace('[TERRAIN REMOVED]', `removeSourceIfExists:${sourceId}`);
      this.map.setTerrain(null);
    }

    try {
      this.map.removeSource(sourceId);
    } catch (error) {
      console.warn('[DEM DIAG] No se pudo remover la fuente temporal:', sourceId, error);
    }
  }

  private buildTerrainResult(
    testName: string,
    sourceId: string,
    sourceLoaded: boolean,
    compareWithBackend: boolean,
    idleReached = false,
    elevationOverride: number | null = null,
    map: MapLibreMap | null = this.map,
  ): DemDiagnosticResult {
    if (!map) {
      return {
        test: testName,
        status: 'FAIL',
        message: 'Mapa no disponible.',
        styleLoaded: false,
        sourceExists: false,
        hillshadeSourceExists: false,
        sourceLoaded: false,
        idleReached: false,
        terrainSource: null,
        projection: null,
      };
    }

    const projection = typeof map.getProjection === 'function' ? map.getProjection() : null;
    const terrain = typeof map.getTerrain === 'function' ? map.getTerrain() : null;
    const styleLoaded = typeof map.isStyleLoaded === 'function' ? Boolean(map.isStyleLoaded()) : false;
    const sourceExists = typeof map.getSource === 'function' ? !!map.getSource(sourceId) : false;
    const center = typeof map.getCenter === 'function' ? map.getCenter() : null;
    const queriedElevation =
      center && typeof map.queryTerrainElevation === 'function'
        ? map.queryTerrainElevation([center.lng, center.lat])
        : null;
    const elevation = elevationOverride ?? queriedElevation;
    const terrainSource = terrain?.source ?? null;
    const pass =
      sourceLoaded &&
      sourceExists &&
      styleLoaded &&
      terrainSource === sourceId &&
      typeof elevation === 'number' &&
      elevation > 0;

    let backendElevation: number | null = null;
    if (compareWithBackend && typeof elevation === 'number') {
      backendElevation = null;
    }

    return {
      test: testName,
      status: pass ? 'PASS' : 'FAIL',
      message: `styleLoaded=${styleLoaded}; sourceExists=${sourceExists}; sourceLoaded=${sourceLoaded}; terrainSource=${terrainSource}; elevation=${elevation}`,
      projection: projection?.type ? String(projection.type) : null,
      styleLoaded,
      sourceExists,
      hillshadeSourceExists: false,
      sourceLoaded,
      idleReached,
      terrainSource,
      elevation,
      backendElevation,
      width: map.getCanvas().width,
      height: map.getCanvas().height,
    };
  }

  // ======================================================
  // CLEANUP
  // ======================================================

  ngOnDestroy(): void {
    this.puntosLayer.dispose();
    this.map?.off('styledataloading', this.handlePuntosStyleLoading);
    for (const marker of this.marcadoresVistaPrevia.values()) marker.remove();
    this.marcadoresVistaPrevia.clear();
    this.map?.off('click', this.handleMapClick);
    this.disposeMeasurementTools?.();
    this.measurementAdapter?.destroy();
    this.closeMapContextMenu();
    console.log('[MapaTresD LIFE] DESTROY');

    if (this.mapLoadTimeoutId !== null) {
      window.clearTimeout(this.mapLoadTimeoutId);
      this.mapLoadTimeoutId = null;
    }

    if (this.demLoadTestTimerId !== null) {
      window.clearTimeout(this.demLoadTestTimerId);
      this.demLoadTestTimerId = null;
    }

    if (this.demLoadFinalSummaryTimerId !== null) {
      window.clearTimeout(this.demLoadFinalSummaryTimerId);
      this.demLoadFinalSummaryTimerId = null;
    }

    for (const timerId of this.terrainCheckpointTimerIds) {
      window.clearTimeout(timerId);
    }
    this.terrainCheckpointTimerIds = [];

    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    window.removeEventListener('resize', this.handleWindowResize);

    if (this.resizeRafId) {
      window.cancelAnimationFrame(this.resizeRafId);
      this.resizeRafId = 0;
    }

    if (this.trayectoriaRetryTimer !== null) {
      window.clearTimeout(this.trayectoriaRetryTimer);
      this.trayectoriaRetryTimer = null;
    }

    if (this.map) {
      this.cancelPendingBaseMapChange();
      this.map.off('style.load', this.handleStyleLoad);
      this.map.off('sourcedata', this.handleSourceData);
      this.map.off('error', this.handleMapError);
      if (this.baseMapControl) {
        this.map.removeControl(this.baseMapControl);
      }
      this.baseMapControl = null;
      this.map.remove();
      this.map = null;
    }

    this.destroyBaselineMap();
  }

  private hasWebGLSupport(): boolean {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl') || canvas.getContext('experimental-webgl'))
    );
  }

  private subscribeToElementos(): void {
    this.mapaElementosService.elementos$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((elementos) => {
        this.zone.runOutsideAngular(() => {
          this.renderElementos(elementos);
        });
      });
  }

  private renderElementos(elementos: ElementoMapa[]): void {
    if (!this.map) {
      return;
    }

    const idsRenderizados = new Set<string>();

    for (const elemento of elementos) {
      const iconUrl = this.obtenerUrlIcono(elemento);

      const coordinates = this.normalizarLatLng(elemento.latitud, elemento.longitud);
      if (!iconUrl || !coordinates) {
        continue;
      }

      idsRenderizados.add(elemento.idTemporal);
      const existente = this.elementoMarkers.get(elemento.idTemporal);
      if (existente) {
        existente.setLngLat([coordinates.lng, coordinates.lat]);
        continue;
      }

      const marker = new maplibregl.Marker({
          element: this.crearElementoMarcador(iconUrl),
          anchor: 'center',
          rotationAlignment: 'viewport',
          pitchAlignment: 'viewport',
          offset: [0, 0],
        })
        .setLngLat([coordinates.lng, coordinates.lat])
        .addTo(this.map);

      this.elementoMarkers.set(elemento.idTemporal, marker);
    }

    for (const [id, marker] of this.elementoMarkers) {
      if (!idsRenderizados.has(id)) {
        marker.remove();
        this.elementoMarkers.delete(id);
      }
    }

    const ultimoElemento = elementos[elementos.length - 1];
    if (ultimoElemento && !this.suppressInitialElementFocus) {
      this.centrarEnElemento(ultimoElemento);
    }

    this.suppressInitialElementFocus = false;
    this.sincronizarRegistrosCoordenadas();
  }

  private sincronizarRegistrosCoordenadas(): void {
    if (!this.map) return;

    const ids = new Set<string>();
    for (const registro of this.registrosCoordenadas) {
      const lat = Number(registro.latitud);
      const lng = Number(registro.longitud);
      if (!registro.id || !Number.isFinite(lat) || !Number.isFinite(lng)) continue;

      ids.add(registro.id);
      if (this.elementoMarkers.has(registro.id)) {
        this.registroMarkers.get(registro.id)?.remove();
        this.registroMarkers.delete(registro.id);
        continue;
      }
      const coordinates: [number, number] = [lng, lat];
      const existing = this.registroMarkers.get(registro.id);
      if (existing) {
        existing.setLngLat(coordinates);
        continue;
      }

      const element = document.createElement('div');
      element.className = 'mapa-3d-registro-marker';
      element.title = registro.nombre;
      element.setAttribute('aria-label', registro.nombre);
      element.style.cssText = registro.icono
        ? 'width:42px;height:42px;display:grid;place-items:center;pointer-events:none'
        : 'width:14px;height:14px;border-radius:50%;background:#f24b50;border:2px solid #ffe7a0;box-shadow:0 0 0 2px rgba(0,0,0,.55),0 0 10px rgba(242,75,80,.8)';
      if (registro.icono) {
        const image = document.createElement('img');
        image.src = registro.icono;
        image.alt = registro.nombre;
        image.style.cssText = 'width:100%;height:100%;object-fit:contain';
        element.appendChild(image);
      }
      this.registroMarkers.set(registro.id, new maplibregl.Marker({ element }).setLngLat(coordinates).addTo(this.map));
    }

    for (const [id, marker] of this.registroMarkers) {
      if (!ids.has(id)) {
        marker.remove();
        this.registroMarkers.delete(id);
      }
    }
  }

  private crearElementoMarcador(iconUrl: string): HTMLElement {
    const wrapper = document.createElement('div');
    wrapper.className = 'mapa-3d-elemento-marker';
    wrapper.style.width = '42px';
    wrapper.style.height = '42px';
    wrapper.style.display = 'grid';
    wrapper.style.placeItems = 'center';
    wrapper.style.pointerEvents = 'none';
    wrapper.style.transform = 'translateY(-50%)';

    const image = document.createElement('img');
    image.src = iconUrl;
    image.alt = 'Elemento graficado';
    image.style.width = '100%';
    image.style.height = '100%';
    image.style.objectFit = 'contain';
    image.style.display = 'block';
    image.style.background = 'transparent';

    wrapper.appendChild(image);
    return wrapper;
  }

  private centrarEnElemento(elemento: ElementoMapa): void {
    const coordinates = this.normalizarLatLng(elemento.latitud, elemento.longitud);
    if (!this.map || !coordinates) {
      return;
    }

    const zoomObjetivo = Math.min(Math.max(this.map.getZoom(), 7), this.maxZoom);

    this.map.flyTo({
      center: [coordinates.lng, coordinates.lat],
      zoom: zoomObjetivo,
      essential: true,
    });
  }

  private obtenerUrlIcono(elemento: ElementoMapa): string | null {
    return elemento.icono;
  }

  private normalizarLatLng(latitud: unknown, longitud: unknown): { lat: number; lng: number } | null {
    if (latitud == null || longitud == null ||
        (typeof latitud === 'string' && latitud.trim() === '') ||
        (typeof longitud === 'string' && longitud.trim() === '')) {
      return null;
    }

    const lat = Number(latitud);
    const lng = Number(longitud);
    return Number.isFinite(lat) && Number.isFinite(lng) &&
      lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
      ? { lat, lng }
      : null;
  }

  private clearElementoMarkers(): void {
    for (const marker of this.elementoMarkers.values()) {
      marker.remove();
    }

    this.elementoMarkers.clear();
    for (const marker of this.registroMarkers.values()) marker.remove();
    this.registroMarkers.clear();
  }
  /**
 * Recibe el GeoJSON generado desde Límites de Seguridad
 * y solicita su representación sobre el mapa 3D.
 */
/** Entrada imperativa compatible: agrega sin reemplazar el historial. */
public graficarPoligono(poligono: FeaturePoligono): void {
  if (!this.poligonosLimites.some(p => p === poligono || (!!p.id && p.id === poligono.id))) {
    this.poligonosLimites = [...this.poligonosLimites, poligono];
  }
  this.sincronizarLimitesSeguridad(true);
}

/** Restaura la coleccion completa en style.load; dos capas con estilo por geometria. */
private sincronizarLimitesSeguridad(centrar = false): void {
  const map = this.map;
  if (!map || !this.poligonosLimites.length || !map.isStyleLoaded()) return;
  const data: GeoJSON.FeatureCollection<GeoJSON.Polygon> = {
    type: 'FeatureCollection',
    features: this.poligonosLimites.map(p => ({ ...p,
      properties: { ...p.properties, ...p.properties.estilo },
    })),
  };
  const source = map.getSource(this.LIMITES_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (source) source.setData(data);
  else map.addSource(this.LIMITES_SOURCE_ID, { type: 'geojson', data });
  if (!map.getLayer(this.LIMITES_FILL_ID)) map.addLayer({
    id: this.LIMITES_FILL_ID, type: 'fill', source: this.LIMITES_SOURCE_ID,
    paint: { 'fill-color': ['get', 'colorRelleno'], 'fill-opacity': ['get', 'opacidadRelleno'] },
  });
  if (!map.getLayer(this.LIMITES_LINE_ID)) map.addLayer({
    id: this.LIMITES_LINE_ID, type: 'line', source: this.LIMITES_SOURCE_ID,
    paint: { 'line-color': ['get', 'colorLinea'], 'line-width': ['get', 'grosorLinea'],
      'line-opacity': ['get', 'opacidadLinea'] },
  });
  if (centrar) {
    const bounds = new maplibregl.LngLatBounds();
    for (const position of this.poligonosLimites.at(-1)!.geometry.coordinates[0]) bounds.extend(position);
    if (!bounds.isEmpty()) map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 700 });
  }
  map.triggerRepaint();
}
}
