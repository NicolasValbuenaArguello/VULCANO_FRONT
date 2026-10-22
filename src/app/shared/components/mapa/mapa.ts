import { MeasurementService } from '../geographic-measurement/measurement.service';
import { LeafletMeasurementAdapter } from '../geographic-measurement/measurement-adapters';
import { ApplicationRef, EnvironmentInjector } from '@angular/core';
import { attachMeasurementTools } from '../geographic-measurement/measurement-overlay';
import { MapActionsService } from '../map-context-menu/map-actions.service';
import { createMapLayersHeader, MAP_LAYERS_ICON, observeMapLayersViewport } from '../map-layers/map-layers-ui';
import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  EventEmitter,
  Input,
  NgZone,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
  inject,
} from '@angular/core';
import * as L from 'leaflet';
import { environment } from '../../../../environments/environment';
import { ElementoMapa } from '../../models/elemento-mapa.model';
import { RelacionFijada } from '../../models/relacion-fijada.model';
import { RegistroCoordenada, SimulacionTrayectoriaResponse } from '../../../core/services/vulcano-api.service';
import { MapaElementosService } from '../../services/mapa-elementos.service';

type LeafletMapConfig = {
  center: L.LatLngExpression;
  zoom: number;
  minZoom: number;
  maxZoom: number;
  tileUrl: string;
  attribution: string;
};

interface BaseMapConfig {
  key: 'streets' | 'satellite' | 'topographic' | 'light' | 'dark';
  name: string;
  url: string;
  attribution: string;
  maxZoom: number;
}

export function camposCoordenadasInvalidos(elemento: ElementoMapa): string[] {
  const camposInvalidos: string[] = [];

  if (typeof elemento.latitud !== 'number' || !Number.isFinite(elemento.latitud)) {
    camposInvalidos.push('latitud');
  }

  if (typeof elemento.longitud !== 'number' || !Number.isFinite(elemento.longitud)) {
    camposInvalidos.push('longitud');
  }

  return camposInvalidos;
}

@Component({
  selector: 'app-mapa',
  standalone: true,
  templateUrl: './mapa.html',
  styleUrl: './mapa.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MapaComponent implements AfterViewInit, OnChanges, OnDestroy {
  // ======================================================
  // INPUTS
  // ======================================================

  /**
   * Centro inicial del mapa.
   * Por defecto apunta a Colombia para que el mapa arranque en una vista útil.
   */
  @Input() center: L.LatLngExpression = L.latLng(
    environment.map.center[0],
    environment.map.center[1],
  );

  /**
   * Nivel de zoom inicial.
   */
  @Input() zoom: number = environment.map.zoom;

  /**
   * Zoom mínimo permitido.
   */
  @Input() minZoom: number = environment.map.minZoom;

  /**
   * Zoom máximo permitido.
   */
  @Input() maxZoom: number = environment.map.maxZoom;

  /**
   * URL del proveedor de tiles. Si no se envía, usa `environment.map.tileUrl`.
   */
  @Input() tileUrl?: string;

  /**
   * Texto de atribución del proveedor de tiles.
   */
  @Input() attribution?: string;
  @Input() relacionFijada: RelacionFijada | null = null;
  @Input() simulacionTrayectoria: SimulacionTrayectoriaResponse | null = null;
  @Input() registrosCoordenadas: readonly RegistroCoordenada[] = [];

  // ======================================================
  // OUTPUTS
  // ======================================================

  /**
   * Se emite cuando Leaflet termina de inicializarse.
   */
  @Output() mapReady = new EventEmitter<L.Map>();

  /**
   * Se emite cuando el usuario hace click sobre el mapa.
   */
  @Output() mapClick = new EventEmitter<{ lat: number; lng: number }>();

  // ======================================================
  // REFERENCIAS DOM
  // ======================================================

  @ViewChild('mapContainer', { static: true })
  private readonly mapContainerRef!: ElementRef<HTMLDivElement>;

  // ======================================================
  // ESTADO INTERNO
  // ======================================================

  private readonly zone = inject(NgZone);
  private readonly measurementApp = inject(ApplicationRef);
  private readonly measurementInjector = inject(EnvironmentInjector);
  private disposeMeasurementTools?: () => void;
  private readonly measurements = inject(MeasurementService);
  private measurementAdapter?: LeafletMeasurementAdapter;
  private readonly mapActions = inject(MapActionsService);
  private readonly mapaElementosService = inject(MapaElementosService);
  private map: L.Map | null = null;
  private resizeObserver: ResizeObserver | null = null;
  private iconConfigurationApplied = false;
  private readonly baseLayers: Partial<Record<BaseMapConfig['key'], L.TileLayer>> = {};
  private readonly overlayLayers: Record<string, L.Layer> = {};
  private baseLayerControl: L.Control.Layers | null = null;
  private disposeLayerControlPresentation?: () => void;
  private activeBaseMapKey: BaseMapConfig['key'] = 'streets';
  private readonly elementoMarkers = new Map<string, L.Marker>();
  private relacionLayer: L.Polyline | null = null;
  private readonly diagnosticosElementosInvalidos = new Set<string>();
  private suppressInitialElementFocus = true;
  private readonly layerControlOptions: L.Control.LayersOptions = {
    position: 'topright',
    collapsed: true,
  };

  // ======================================================
  // CICLO DE VIDA
  // ======================================================

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      this.initializeMap();
      this.renderRelacion();
      this.observeContainerResize();
      this.renderRegistros(this.registrosCoordenadas);
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.map) {
      return;
    }

    if (changes['center'] || changes['zoom']) {
      this.setView(this.center, this.zoom);
    }

    if (changes['minZoom']) {
      this.map.setMinZoom(this.minZoom);
    }

    if (changes['maxZoom']) {
      this.map.setMaxZoom(this.maxZoom);
    }

    if (changes['relacionFijada'] || changes['simulacionTrayectoria']) this.renderRelacion();
    if (changes['registrosCoordenadas']) this.renderRegistros(this.registrosCoordenadas);

    if (changes['tileUrl'] || changes['attribution']) {
      this.rebuildBaseMaps();
    }
  }

  ngOnDestroy(): void {
    this.disposeMeasurementTools?.();
    this.measurementAdapter?.destroy();
    if (this.map) this.mapActions.closeFor(this.map.getContainer());
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    window.removeEventListener('resize', this.handleWindowResize);

    this.clearElementoMarkers();
    this.disposeBaseLayerControl();
    this.clearBaseLayers();

    this.map?.off('zoomend moveend resize', this.handleMapViewChange);
    this.map?.remove();
    this.map = null;
    this.relacionLayer = null;
  }

  // ======================================================
  // INICIALIZACIÓN
  // ======================================================

  /**
   * Inicializa Leaflet dentro del contenedor.
   */
  private initializeMap(): void {
    if (this.map) {
      return;
    }

    const container = this.mapContainerRef.nativeElement;
    const config = this.resolveMapConfig();

    this.configureDefaultIcons();

    this.map = L.map(container, {
      center: config.center,
      zoom: config.zoom,
      minZoom: config.minZoom,
      maxZoom: config.maxZoom,
      zoomControl: true,
    });

    this.initializeBaseMaps();
    this.bindMapEvents();
    this.disposeMeasurementTools = attachMeasurementTools(container, this.measurementApp, this.measurementInjector);
    this.measurementAdapter = new LeafletMeasurementAdapter(this.map!, this.measurements);
    this.refreshMapSize();

    this.zone.run(() => {
      this.mapReady.emit(this.map!);
    });
  }

  private bindMapEvents(): void {
    if (!this.map) {
      return;
    }

    this.map.on('click', (event) => {
      this.zone.run(() => {
        this.mapClick.emit({
          lat: event.latlng.lat,
          lng: event.latlng.lng,
        });
      });
    });

    this.map.on('contextmenu', this.handleMapContextMenu);
    this.map.on('movestart zoomstart', this.closeMapContextMenu);
    this.map.on('baselayerchange', this.handleBaseLayerChange);
    this.map.on('zoomend moveend resize', this.handleMapViewChange);
  }

  /** Utiliza la conversion geografica nativa de Leaflet para el punto bajo el cursor. */
  private readonly handleMapContextMenu = (event: L.LeafletMouseEvent): void => {
    if (!this.map) return;
    const point = Math.abs(event.latlng.lng) <= 180 ? event.latlng : event.latlng.wrap();
    this.mapActions.open(this.map.getContainer(), { latitud: point.lat, longitud: point.lng }, event.originalEvent);
  };

  /** Evita mantener un menu anclado a una posicion de pantalla que ya cambio. */
  private readonly closeMapContextMenu = (): void => {
    if (this.map) this.mapActions.closeFor(this.map.getContainer());
  };

  private initializeBaseMaps(): void {
    if (!this.map) {
      return;
    }

    this.disposeBaseLayerControl();
    this.clearBaseLayers();

    const configs = this.buildBaseMapConfigs();
    const baseMaps: Record<string, L.TileLayer> = {};
    let initialLayer: L.TileLayer | null = null;

    for (const config of configs) {
      const layer = L.tileLayer(config.url, {
        maxZoom: config.maxZoom,
        attribution: config.attribution,
      });

      this.baseLayers[config.key] = layer;
      baseMaps[config.name] = layer;

      if (config.key === this.activeBaseMapKey) {
        initialLayer = layer;
      }
    }

    const defaultLayer = initialLayer ?? this.baseLayers.streets ?? Object.values(this.baseLayers)[0] ?? null;

    defaultLayer?.addTo(this.map);
    this.baseLayerControl = L.control.layers(baseMaps, this.overlayLayers, this.layerControlOptions).addTo(this.map);
    this.styleBaseLayerControl();
  }

  /** Personaliza la presentacion del control nativo conservando su seleccion de capas. */
  private styleBaseLayerControl(): void {
    const control = this.baseLayerControl;
    const container = control?.getContainer();
    if (!control || !container) return;
    container.classList.add('vulcano-map-layers');
    const toggle = container.querySelector<HTMLAnchorElement>('.leaflet-control-layers-toggle')!;
    const panel = container.querySelector<HTMLElement>('.leaflet-control-layers-list')!;
    toggle.innerHTML = MAP_LAYERS_ICON;
    toggle.title = 'Capas del mapa';
    toggle.setAttribute('aria-label', 'Capas del mapa');
    toggle.setAttribute('aria-expanded', 'false');
    panel.prepend(createMapLayersHeader());
    // La apertura explicita sustituye el hover del control sin cambiar sus radios.
    L.DomEvent.off(container);
    L.DomEvent.disableClickPropagation(container);
    L.DomEvent.disableScrollPropagation(container);
    L.DomEvent.off(toggle);
    const sync = () => {
      const open = container.classList.contains('leaflet-control-layers-expanded');
      toggle.setAttribute('aria-expanded', String(open));
      panel.inert = !open;
      panel.setAttribute('aria-hidden', String(!open));
    };
    toggle.addEventListener('click', event => {
      event.preventDefault();
      if (container.classList.contains('leaflet-control-layers-expanded')) control.collapse();
      else control.expand();
      sync();
    });
    container.addEventListener('keydown', event => {
      if (event.key === 'Escape') { control.collapse(); sync(); toggle.focus(); }
      if (event.target === toggle && event.key === ' ') { event.preventDefault(); toggle.click(); }
    });
    const overlays = container.querySelector<HTMLElement>('.leaflet-control-layers-overlays');
    if (overlays && Object.keys(this.overlayLayers).length) {
      overlays.setAttribute('aria-label', 'CAPAS DISPONIBLES');
      overlays.dataset['heading'] = 'CAPAS DISPONIBLES';
    }
    const observer = new MutationObserver(sync);
    observer.observe(container, { attributes: true, attributeFilter: ['class'] });
    const stopViewportObservation = observeMapLayersViewport(container, this.map!.getContainer());
    this.disposeLayerControlPresentation = () => { observer.disconnect(); stopViewportObservation(); };
    sync();
  }

  private rebuildBaseMaps(): void {
    if (!this.map) {
      return;
    }

    this.initializeBaseMaps();
    this.refreshMapSize();
  }

  private resolveMapConfig(): LeafletMapConfig {
    return {
      center: this.center,
      zoom: this.zoom,
      minZoom: this.minZoom,
      maxZoom: this.maxZoom,
      tileUrl: this.tileUrl?.trim() || environment.map.tileUrl,
      attribution: this.attribution?.trim() || environment.map.attribution,
    };
  }

  private buildBaseMapConfigs(): BaseMapConfig[] {
    const streetsConfig = this.resolveMapConfig();

    return [
      {
        key: 'streets',
        name: 'Calles',
        url: streetsConfig.tileUrl,
        attribution: streetsConfig.attribution,
        maxZoom: streetsConfig.maxZoom,
      },
      {
        key: 'satellite',
        name: 'Satelital',
        url: environment.map.satellite,
        attribution: 'Tiles © Esri',
        maxZoom: 19,
      },
      {
        key: 'topographic',
        name: 'Topográfico',
        url: environment.map.topographic,
        attribution: 'Map data: © OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap (CC-BY-SA)',
        maxZoom: 17,
      },
      {
        key: 'light',
        name: 'Claro',
        url: environment.map.light,
        attribution: '© OpenStreetMap contributors © CARTO',
        maxZoom: 20,
      },
      {
        key: 'dark',
        name: 'Oscuro',
        url: environment.map.dark,
        attribution: '© OpenStreetMap contributors © CARTO',
        maxZoom: 20,
      },
    ];
  }

  private configureDefaultIcons(): void {
    if (this.iconConfigurationApplied) {
      return;
    }

    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'assets/leaflet/marker-icon-2x.png',
      iconUrl: 'assets/leaflet/marker-icon.png',
      shadowUrl: 'assets/leaflet/marker-shadow.png',
    });

    this.iconConfigurationApplied = true;
  }

  private clearBaseLayers(): void {
    for (const layer of Object.values(this.baseLayers)) {
      layer?.remove();
    }

    for (const key of Object.keys(this.baseLayers)) {
      delete this.baseLayers[key as BaseMapConfig['key']];
    }
  }

  /** Libera tambien la observacion visual del control al reconstruir o destruir el mapa. */
  private disposeBaseLayerControl(): void {
    this.disposeLayerControlPresentation?.();
    this.disposeLayerControlPresentation = undefined;
    if (this.baseLayerControl) {
      this.baseLayerControl.remove();
      this.baseLayerControl = null;
    }
  }

  private observeContainerResize(): void {
    const container = this.mapContainerRef.nativeElement;

    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', this.handleWindowResize);
      return;
    }

    this.resizeObserver = new ResizeObserver(() => {
      this.refreshMapSize();
    });

    this.resizeObserver.observe(container);
  }

  private readonly handleWindowResize = (): void => {
    this.refreshMapSize();
  };

  private readonly handleBaseLayerChange = (event: L.LayersControlEvent): void => {
    const selectedKey = this.findBaseMapKeyByName(event.name);
    if (selectedKey) {
      this.activeBaseMapKey = selectedKey;
    }
  };

  private readonly handleMapViewChange = (): void => {
    this.renderRelacion();
  };

  // ======================================================
  // API PÚBLICA
  // ======================================================

  /**
   * Fuerza a Leaflet a recalcular el tamaño del mapa.
   * Debe utilizarse cuando cambia el tamaño del panel padre.
   */
  public refreshMapSize(): void {
    this.map?.invalidateSize();
  }

  public setView(center: L.LatLngExpression, zoom?: number): void {
    if (!this.map) {
      return;
    }

    const coordinates = this.normalizarCentro(center);
    if (!coordinates) {
      return;
    }

    this.map.setView([coordinates.lat, coordinates.lng], zoom ?? this.zoom, { animate: false });
  }

  public obtenerEstadoCamara(): { lat: number; lng: number; zoom: number } | null {
    if (!this.map) {
      return null;
    }

    const center = this.map.getCenter();

    return {
      lat: center.lat,
      lng: center.lng,
      zoom: this.map.getZoom(),
    };
  }

  public async capturarParaInforme(): Promise<string> {
    if (!this.map) throw new Error('El mapa 2D no está disponible para el informe.');
    this.renderRelacion();
    this.map.invalidateSize({ animate: false });
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    const container = this.map.getContainer();
    const bounds = container.getBoundingClientRect();
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bounds.width));
    canvas.height = Math.max(1, Math.round(bounds.height));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('No fue posible crear la captura del mapa 2D.');
    const images = Array.from(container.querySelectorAll<HTMLImageElement>('.leaflet-tile, .leaflet-marker-icon, .leaflet-marker-shadow'));
    if (!images.length) throw new Error('El mapa 2D no tiene tiles o marcadores para capturar.');
    const drawImages = async (sources: HTMLImageElement[]) => Promise.all(sources.map(async source => {
      const image = await this.cargarImagenParaInforme(source.currentSrc || source.src);
      const rect = source.getBoundingClientRect();
      context.drawImage(image, rect.left - bounds.left, rect.top - bounds.top, rect.width, rect.height);
    }));
    await drawImages(images.filter(source => source.classList.contains('leaflet-tile')));
    const overlays = Array.from(container.querySelectorAll<SVGSVGElement>('.leaflet-overlay-pane svg'));
    await Promise.all(overlays.map(async overlay => {
      const image = await this.cargarSvgParaInforme(overlay);
      const rect = overlay.getBoundingClientRect();
      context.drawImage(image, rect.left - bounds.left, rect.top - bounds.top, rect.width, rect.height);
    }));
    await drawImages(images.filter(source => !source.classList.contains('leaflet-tile')));
    context.font = '12px Arial';
    context.fillStyle = '#ffffff';
    context.strokeStyle = '#111111';
    context.lineWidth = 2;
    for (const registro of this.registrosCoordenadas) {
      const coordinates = this.normalizarLatLng(registro.latitud, registro.longitud);
      if (!coordinates || !registro.nombre) continue;
      const point = this.map.latLngToContainerPoint([coordinates.lat, coordinates.lng]);
      context.strokeText(registro.nombre, point.x + 24, point.y - 12);
      context.fillText(registro.nombre, point.x + 24, point.y - 12);
    }
    console.log('[INFORME][2D] puntos incluidos:', this.registrosCoordenadas.length, { marcadoresDom: images.length, overlaysSvg: overlays.length });
    const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
    let pixelesVisibles = 0;
    for (let index = 0; index < data.length; index += 16) {
      if (data[index + 3] > 0 && data[index] + data[index + 1] + data[index + 2] > 24) pixelesVisibles++;
    }
    if (pixelesVisibles < 12) throw new Error('La captura mapa 2D no contiene representación gráfica válida.');
    const captura = canvas.toDataURL('image/png');
    console.log('[INFORME] mapa2D capturado:', { width: canvas.width, height: canvas.height, bytes: captura.length });
    return captura;
  }

  private cargarImagenParaInforme(source: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`No fue posible cargar una capa del mapa 2D: ${source}`));
      image.src = source;
    });
  }

  private cargarSvgParaInforme(svg: SVGSVGElement): Promise<HTMLImageElement> {
    const clone = svg.cloneNode(true) as SVGSVGElement;
    const sourceNodes = [svg, ...Array.from(svg.querySelectorAll('*'))];
    const cloneNodes = [clone, ...Array.from(clone.querySelectorAll('*'))];
    sourceNodes.forEach((node, index) => {
      const styles = getComputedStyle(node);
      cloneNodes[index].setAttribute('style', Array.from(styles).map(name => `${name}:${styles.getPropertyValue(name)};`).join(''));
    });
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: 'image/svg+xml' }));
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
      image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('No fue posible capturar una capa SVG del mapa 2D.')); };
      image.src = url;
    });
  }

  public addMarker(lat: number, lng: number, popup?: string): L.Marker | null {
    if (!this.map) {
      return null;
    }

    const coordinates = this.normalizarLatLng(lat, lng);
    if (!coordinates) {
      return null;
    }

    const marker = L.marker([coordinates.lat, coordinates.lng]).addTo(this.map);

    if (popup) {
      marker.bindPopup(popup);
    }

    return marker;
  }

  private renderRegistros(registros: readonly RegistroCoordenada[]): void {
    if (!this.map) return;

    const idsRenderizados = new Set<string>();
    for (const registro of registros) {
      const coordinates = this.normalizarLatLng(registro.latitud, registro.longitud);
      if (!coordinates || !registro.id) continue;

      idsRenderizados.add(registro.id);
      const existente = this.elementoMarkers.get(registro.id);
      if (existente) {
        existente.setLatLng([coordinates.lat, coordinates.lng]);
        continue;
      }

      const elemento = this.mapaElementosService.obtenerElementos()
        .find(item => item.idTemporal === registro.id);
      const iconUrl = registro.icono ?? elemento?.icono;
      const icon = iconUrl
        ? L.icon({
            iconUrl,
            iconSize: [42, 42],
            iconAnchor: [21, 21],
            popupAnchor: [0, -18],
            className: 'vulcano-element-marker',
          })
        : undefined;
      const marker = L.marker([coordinates.lat, coordinates.lng], icon ? { icon } : undefined).addTo(this.map);
      marker.bindTooltip(registro.nombre);
      this.elementoMarkers.set(registro.id, marker);
    }

    for (const [id, marker] of this.elementoMarkers) {
      if (!idsRenderizados.has(id)) {
        marker.remove();
        this.elementoMarkers.delete(id);
      }
    }
  }

  private renderElementos(elementos: ElementoMapa[]): void {
    if (!this.map) {
      return;
    }

    const elementosValidos: ElementoMapa[] = [];
    const idsRenderizados = new Set<string>();

    for (const elemento of elementos) {
      if (!this.esElementoGeolocalizable(elemento)) {
        continue;
      }

      const coordinates = this.obtenerLatLngValido(elemento);
      if (!coordinates) {
        continue;
      }

      const iconUrl = this.obtenerUrlIcono(elemento);

      if (!iconUrl) {
        continue;
      }

      idsRenderizados.add(elemento.idTemporal);
      const existente = this.elementoMarkers.get(elemento.idTemporal);
      if (existente) {
        existente.setLatLng([coordinates.lat, coordinates.lng]);
        elementosValidos.push(elemento);
        continue;
      }

      const icon = L.icon({
        iconUrl,
        iconSize: [42, 42],
        iconAnchor: [21, 21],
        popupAnchor: [0, -18],
        className: 'vulcano-element-marker',
      });

      const marker = L.marker([coordinates.lat, coordinates.lng], {
        icon,
        keyboard: false,
        riseOnHover: true,
      }).addTo(this.map);

      this.elementoMarkers.set(elemento.idTemporal, marker);
      elementosValidos.push(elemento);
    }

    for (const [id, marker] of this.elementoMarkers) {
      if (!idsRenderizados.has(id)) {
        marker.remove();
        this.elementoMarkers.delete(id);
      }
    }

    const ultimoElemento = elementosValidos.at(-1);
    if (ultimoElemento && !this.suppressInitialElementFocus) {
      this.centrarEnElemento(ultimoElemento);
    }

    this.suppressInitialElementFocus = false;
  }

  private centrarEnElemento(elemento: ElementoMapa): void {
    if (!this.map || !this.esElementoGeolocalizable(elemento)) {
      return;
    }

    const coordinates = this.obtenerLatLngValido(elemento);
    if (!coordinates) {
      return;
    }

    const zoomObjetivo = Math.min(Math.max(this.map.getZoom(), 9), this.maxZoom);

    this.map.flyTo([coordinates.lat, coordinates.lng], zoomObjetivo, {
      animate: true,
      duration: 0.8,
    });
  }

  private obtenerUrlIcono(elemento: ElementoMapa): string | null {
    return elemento.icono;
  }

  private normalizarLatLng(valorLatitud: unknown, valorLongitud: unknown): { lat: number; lng: number } | null {
    if (valorLatitud == null || valorLongitud == null ||
        (typeof valorLatitud === 'string' && valorLatitud.trim() === '') ||
        (typeof valorLongitud === 'string' && valorLongitud.trim() === '')) {
      return null;
    }

    const lat = Number(valorLatitud);
    const lng = Number(valorLongitud);
    return Number.isFinite(lat) && Number.isFinite(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
      ? { lat, lng }
      : null;
  }

  private obtenerLatLngValido(elemento: Pick<ElementoMapa, 'latitud' | 'longitud'>): { lat: number; lng: number } | null {
    return this.normalizarLatLng(elemento.latitud, elemento.longitud);
  }

  private esElementoGeolocalizable(elemento: ElementoMapa): boolean {
    const camposInvalidos = camposCoordenadasInvalidos(elemento);

    if (camposInvalidos.length === 0) {
      this.limpiarDiagnosticoElemento(elemento.idTemporal);
      return true;
    }

    const diagnostico = `${elemento.idTemporal}:${camposInvalidos.join(',')}`;
    if (!this.diagnosticosElementosInvalidos.has(diagnostico)) {
      this.diagnosticosElementosInvalidos.add(diagnostico);
      console.warn(`[Mapa] Elemento omitido por coordenadas inválidas: ${camposInvalidos.join(', ')}.`);
    }

    return false;
  }

  private limpiarDiagnosticoElemento(idTemporal: string): void {
    for (const diagnostico of this.diagnosticosElementosInvalidos) {
      if (diagnostico.startsWith(`${idTemporal}:`)) {
        this.diagnosticosElementosInvalidos.delete(diagnostico);
      }
    }
  }

  private clearElementoMarkers(): void {
    for (const marker of this.elementoMarkers.values()) {
      marker.remove();
    }

    this.elementoMarkers.clear();
  }

  private normalizarCentro(center: L.LatLngExpression): { lat: number; lng: number } | null {
    if (Array.isArray(center)) {
      return this.normalizarLatLng(center[0], center[1]);
    }

    if (center && typeof center === 'object' && 'lat' in center && 'lng' in center) {
      return this.normalizarLatLng(center.lat, center.lng);
    }

    return null;
  }

  private renderRelacion(): void {
    if (!this.map) return;
    const relacion = this.relacionFijada;
    const simulacion = this.simulacionTrayectoria;
    const valid = (point: { latitud: number; longitud: number } | null | undefined) =>
      !!point && Number.isFinite(point.latitud) && Math.abs(point.latitud) <= 90 &&
      Number.isFinite(point.longitud) && Math.abs(point.longitud) <= 180;
    let puntos: L.LatLng[] = [];
    let trayectoria = false;
    if (simulacion?.simulacion === true && valid(simulacion.p1) && valid(simulacion.p2) &&
        Array.isArray(simulacion.perfil_elevacion) && simulacion.perfil_elevacion.length >= 2) {
      const perfil = simulacion.perfil_elevacion.filter(valid);
      if (perfil.length >= 2) {
        const inicio = L.latLng(simulacion.p1.latitud, simulacion.p1.longitud);
        const fin = L.latLng(simulacion.p2.latitud, simulacion.p2.longitud);
        const intermedios = perfil.map(point => L.latLng(point.latitud, point.longitud))
          .filter(point => !point.equals(inicio, 0) && !point.equals(fin, 0));
        puntos = [inicio, ...intermedios, fin].filter((point, index, all) => index === 0 || !point.equals(all[index - 1], 0));
        trayectoria = true;
        console.log('[TRAYECTORIA 2D]', { muestras: simulacion.perfil_elevacion.length, puntos: puntos.length, inicio, fin });
      }
    }
    if (!trayectoria && relacion) {
      const origen = this.normalizarLatLng(relacion.origen.latitud, relacion.origen.longitud);
      const destino = this.normalizarLatLng(relacion.destino.latitud, relacion.destino.longitud);
      if (origen && destino) puntos = [L.latLng(origen.lat, origen.lng), L.latLng(destino.lat, destino.lng)];
    }
    if (puntos.length < 2) {
      this.relacionLayer?.remove();
      this.relacionLayer = null;
      return;
    }
    const style: L.PolylineOptions = {
      color: '#ff5d4d', weight: trayectoria ? 4 : 3, opacity: 0.95,
      dashArray: trayectoria ? '' : '8 5', pane: 'overlayPane', interactive: false,
    };
    if (this.relacionLayer) {
      this.relacionLayer.setLatLngs(puntos).setStyle(style);
    } else {
      this.relacionLayer = L.polyline(puntos, { ...style, renderer: L.svg() }).addTo(this.map);
    }
  }

  private findBaseMapKeyByName(name: string): BaseMapConfig['key'] | null {
    const config = this.buildBaseMapConfigs().find((item) => item.name === name);
    return config?.key ?? null;
  }
}
