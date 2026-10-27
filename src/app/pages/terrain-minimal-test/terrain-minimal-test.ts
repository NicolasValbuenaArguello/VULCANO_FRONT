import { inject } from '@angular/core';
import { CartographyConfigService } from '../../shared/services/cartography-config.service';
import { AfterViewInit, Component, ElementRef, OnDestroy, ViewChild } from '@angular/core';
import * as maplibregl from 'maplibre-gl';
import { environment } from '../../../environments/environment';
import type {
  Map as MapLibreMap,
  SourceSpecification,
  StyleSpecification,
  TerrainSpecification,
} from 'maplibre-gl';

type VariantName = 'direct256' | 'tilejson256' | 'tilejson512' | 'customTerrarium';

interface DemHealthResult {
  status: number | null;
  ok: boolean;
  body: unknown;
}

interface VariantResult {
  elevation5: number | null;
  elevation10: number | null;
  elevation20: number | null;
  terrain: TerrainSpecification | null;
  visual: boolean;
  errors: string[];
}

interface VariantSummary {
  elevation5: number | null;
  elevation10: number | null;
  elevation20: number | null;
  terrain: {
    source: string;
    exaggeration?: number;
  } | null;
  visual: boolean;
  errors: number;
}

interface TerrainReport {
  maplibreVersion: string;
  demHealth: DemHealthResult;
  backendElevation: number | null;
  direct256: VariantSummary;
  tilejson256: VariantSummary;
  tilejson512: VariantSummary;
  customTerrarium: VariantSummary | null;
  winnerVariant: string;
  causeProbable: string;
  nextChangeRecommended: string;
}

@Component({
  selector: 'app-terrain-minimal-test',
  standalone: true,
  templateUrl: './terrain-minimal-test.html',
  styleUrl: './terrain-minimal-test.css',
})
export class TerrainMinimalTest implements AfterViewInit, OnDestroy {
  @ViewChild('mapContainer', { static: true })
  private readonly mapContainer!: ElementRef<HTMLDivElement>;

  private readonly demBaseUrl = 'http://127.0.0.1:8010';
  private readonly demTilesUrl = `${this.demBaseUrl}/dem/tiles/{z}/{x}/{y}.png`;
  private readonly demTileJsonUrl = `${this.demBaseUrl}/dem/tilejson.json`;
  private readonly demTileJson512Url = `${this.demBaseUrl}/dem512/tilejson.json`;
  private readonly timers: number[] = [];
  private destroyed = false;
  private runStarted = false;
  private activeMap: MapLibreMap | null = null;

  constructor() {
    console.error('############################');
    console.error('TERRAIN MINIMAL TEST ALIVE');
    console.error('############################');
    console.log('[ROUTE TEST]', window.location.pathname);
  }

  ngAfterViewInit(): void {
    console.log('[MINIMAL COMPONENT START]');
    void this.runTerrainDiagnostic();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.clearTimers();
    this.activeMap?.remove();
    this.activeMap = null;
  }

  private async runTerrainDiagnostic(): Promise<void> {
    if (this.runStarted) {
      return;
    }

    this.runStarted = true;
    this.setStatus('backend-check');

    const maplibreVersion = await this.getMapLibreVersion();
    const demHealth = await this.fetchDemHealth();
    const backendElevation = demHealth.ok ? await this.fetchBackendElevation() : null;

    if (!demHealth.ok) {
      const report: TerrainReport = {
      maplibreVersion,
      demHealth,
      backendElevation,
      direct256: this.simplifyVariant(this.emptyVariant()),
      tilejson256: this.simplifyVariant(this.emptyVariant()),
      tilejson512: this.simplifyVariant(this.emptyVariant()),
      customTerrarium: null,
        winnerVariant: 'none',
        causeProbable: 'El backend DEM no respondió correctamente, así que no es seguro ejecutar las pruebas de terrain.',
        nextChangeRecommended: 'Corregir el estado del backend DEM antes de seguir con las variantes de MapLibre.',
      };

      (window as Window & { __terrainABReport?: unknown }).__terrainABReport = report;
      console.log('[LOCAL DEM A/B/C FINAL]', report);
      this.setStatus('backend-fail');
      return;
    }

    const direct256 = await this.runVariant('direct256');
    if (this.destroyed) {
      return;
    }

    const tilejson256 = await this.runVariant('tilejson256');
    if (this.destroyed) {
      return;
    }

    const tilejson512 = await this.runVariant('tilejson512');
    if (this.destroyed) {
      return;
    }

    let customTerrarium: VariantResult | null = null;
    const directWorks = this.hasPositiveElevation(direct256);
    const tilejson256Works = this.hasPositiveElevation(tilejson256);
    const tilejson512Works = this.hasPositiveElevation(tilejson512);

    if (!directWorks && !tilejson256Works && !tilejson512Works) {
      customTerrarium = await this.runVariant('customTerrarium');
    }

    const report: TerrainReport = {
      maplibreVersion,
      demHealth,
      backendElevation,
      direct256: this.simplifyVariant(direct256),
      tilejson256: this.simplifyVariant(tilejson256),
      tilejson512: this.simplifyVariant(tilejson512),
      customTerrarium: customTerrarium ? this.simplifyVariant(customTerrarium) : null,
      winnerVariant: this.pickWinnerVariant(direct256, tilejson256, tilejson512, customTerrarium),
      causeProbable: this.buildCauseProbable(direct256, tilejson256, tilejson512, customTerrarium),
      nextChangeRecommended: this.buildNextChangeRecommendation(direct256, tilejson256, tilejson512, customTerrarium),
    };

    (window as Window & { __terrainABReport?: unknown }).__terrainABReport = report;
    console.log('[LOCAL DEM A/B/C FINAL]', report);
    this.setStatus('diagnostic-done');
  }

  private async runVariant(variant: VariantName): Promise<VariantResult> {
    const errors: string[] = [];
    const result: VariantResult = {
      elevation5: null,
      elevation10: null,
      elevation20: null,
      terrain: null,
      visual: false,
      errors,
    };

    const { style, center, zoom } = this.createVariantStyle(variant);
    const map = this.createMap(style, center, zoom, 70, 0, errors, `[${variant.toUpperCase()} ERROR]`);
    this.activeMap = map;

    await new Promise<void>((resolve) => {
      map.once('load', () => {
        result.terrain = map.getTerrain();
        result.visual = !!map.getTerrain();
        console.log(`[${variant.toUpperCase()} LOAD]`, {
          terrain: map.getTerrain(),
          terrainSource: map.getSource('terrainSource')?.serialize?.(),
          hillshadeSource: map.getSource('hillshadeSource')?.serialize?.(),
          hillshadeLayer: !!map.getLayer('hillshade'),
          center: map.getCenter(),
          zoom: map.getZoom(),
          pitch: map.getPitch(),
        });
        resolve();
      });
    });

    this.scheduleChecks(map, variant, result);
    this.setStatus(`${variant}-running`);
    await this.sleep(21000);
    this.clearTimers();

    result.terrain = map.getTerrain();
    result.visual = !!map.getTerrain();
    console.log(`[${variant.toUpperCase()} RESULT]`, result);

    map.remove();
    this.activeMap = null;
    await this.sleep(500);

    return result;
  }

  private readonly cartography = inject(CartographyConfigService);

  private createVariantStyle(variant: VariantName): {
    style: StyleSpecification;
    center: [number, number];
    zoom: number;
  } {
    const base = this.cartography.mapLibreLayers()[this.cartography.resolveSelection()];
    const baseSources = {
      osm: {
        type: 'raster',
        // Comparte proveedor y atribucion con los mapas principales, sin endpoints alternativos.
        tiles: base.tiles,
        attribution: base.attribution,
        tileSize: 256,
        maxzoom: 19,
      },
    } satisfies Record<string, SourceSpecification>;

    const terrainSource = this.createTerrainSource(variant);
    const hillshadeSource = this.createHillshadeSource(variant);

    return {
      style: {
        version: 8,
        sources: {
          ...baseSources,
          terrainSource,
          hillshadeSource,
        },
        layers: [
          {
            id: 'osm',
            type: 'raster',
            source: 'osm',
          },
          {
            id: 'hillshade',
            type: 'hillshade',
            source: 'hillshadeSource',
            paint: {
              'hillshade-exaggeration': 0.8,
            },
          },
        ],
        terrain: {
          source: 'terrainSource',
          exaggeration: 1,
        },
      },
      center: [-74.05, 4.65],
      zoom: 10,
    };
  }

  private createTerrainSource(variant: VariantName): SourceSpecification {
    if (variant === 'direct256') {
      return {
        type: 'raster-dem',
        tiles: [this.demTilesUrl],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 13,
        encoding: 'terrarium',
      };
    }

    if (variant === 'tilejson256') {
      return {
        type: 'raster-dem',
        url: this.demTileJsonUrl,
        tileSize: 256,
        encoding: 'terrarium',
      };
    }

    if (variant === 'tilejson512') {
      return {
        type: 'raster-dem',
        url: this.demTileJson512Url,
        tileSize: 512,
        encoding: 'terrarium',
      };
    }

    return {
      type: 'raster-dem',
      tiles: [this.demTilesUrl],
      tileSize: 256,
      encoding: 'custom',
      redFactor: 256,
      greenFactor: 1,
      blueFactor: 0.00390625,
      baseShift: -32768,
    };
  }

  private createHillshadeSource(variant: VariantName): SourceSpecification {
    if (variant === 'direct256') {
      return {
        type: 'raster-dem',
        tiles: [this.demTilesUrl],
        tileSize: 256,
        minzoom: 0,
        maxzoom: 13,
        encoding: 'terrarium',
      };
    }

    if (variant === 'tilejson256') {
      return {
        type: 'raster-dem',
        url: this.demTileJsonUrl,
        tileSize: 256,
        encoding: 'terrarium',
      };
    }

    if (variant === 'tilejson512') {
      return {
        type: 'raster-dem',
        url: this.demTileJson512Url,
        tileSize: 512,
        encoding: 'terrarium',
      };
    }

    return {
      type: 'raster-dem',
      tiles: [this.demTilesUrl],
      tileSize: 256,
      encoding: 'custom',
      redFactor: 256,
      greenFactor: 1,
      blueFactor: 0.00390625,
      baseShift: -32768,
    };
  }

  private createMap(
    style: StyleSpecification,
    center: [number, number],
    zoom: number,
    pitch: number,
    bearing: number,
    errors: string[],
    errorLabel: string,
  ): MapLibreMap {
    const map = new maplibregl.Map({
      container: this.mapContainer.nativeElement,
      style,
      center,
      zoom,
      pitch,
      bearing,
      maxPitch: 85,
    });

    map.on('error', (event) => {
      const message = this.describeMapError(event);
      errors.push(message);
      console.error(errorLabel, message);
    });

    return map;
  }

  private scheduleChecks(map: MapLibreMap, variant: VariantName, result: VariantResult): void {
    const checkpoints = [5, 10, 20];

    for (const seconds of checkpoints) {
      const timerId = window.setTimeout(() => {
        const elevation = this.checkElevation(map, variant, seconds);
        if (seconds === 5) {
          result.elevation5 = elevation;
        } else if (seconds === 10) {
          result.elevation10 = elevation;
        } else if (seconds === 20) {
          result.elevation20 = elevation;
        }
      }, seconds * 1000);

      this.timers.push(timerId);
    }
  }

  private checkElevation(map: MapLibreMap, variant: string, seconds: number): number | null {
    const center = map.getCenter();
    const elevation = (map as any).queryTerrainElevation(center, { exaggerated: false }) as number | null;

    console.log(`[${variant.toUpperCase()} ELEVATION ${seconds}s]`, {
      elevation,
      terrain: map.getTerrain(),
      center,
      zoom: map.getZoom(),
      pitch: map.getPitch(),
    });

    return elevation;
  }

  private async fetchDemHealth(): Promise<DemHealthResult> {
    try {
      const response = await fetch(`${this.demBaseUrl}/dem/health`);
      const body = await response.text();
      const result: DemHealthResult = {
        status: response.status,
        ok: response.ok,
        body: this.tryParseJson(body),
      };

      console.log('[DEM HEALTH]', result);
      return result;
    } catch (error) {
      const result: DemHealthResult = {
        status: null,
        ok: false,
        body: String(error),
      };

      console.log('[DEM HEALTH]', result);
      console.error('[DEM HEALTH ERROR]', error);
      return result;
    }
  }

  private async fetchBackendElevation(): Promise<number | null> {
    try {
      const response = await fetch(`${this.demBaseUrl}/dem/elevacion?lat=4.65&lon=-74.05`);
      const body = await response.text();
      const parsed = this.tryParseJson(body);
      const elevation =
        this.extractElevationValue(parsed) ??
        this.extractElevationValue(body) ??
        null;

      console.log('[BACKEND ELEVATION]', {
        status: response.status,
        ok: response.ok,
        body: parsed,
        elevation,
      });

      return elevation;
    } catch (error) {
      console.error('[BACKEND ELEVATION ERROR]', error);
      return null;
    }
  }

  private extractElevationValue(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === 'string') {
      const direct = Number(value.trim());
      if (Number.isFinite(direct)) {
        return direct;
      }

      try {
        const parsed = JSON.parse(value) as unknown;
        return this.extractElevationValue(parsed);
      } catch {
        return null;
      }
    }

    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      for (const key of ['elevation', 'elevacion', 'value', 'height', 'z', 'result']) {
        const extracted = this.extractElevationValue(record[key]);
        if (extracted !== null) {
          return extracted;
        }
      }
    }

    return null;
  }

  private tryParseJson(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }

  private hasPositiveElevation(result: VariantResult): boolean {
    return [result.elevation5, result.elevation10, result.elevation20].some(
      (value) => typeof value === 'number' && value > 0,
    );
  }

  private pickWinnerVariant(
    direct256: VariantResult,
    tilejson256: VariantResult,
    tilejson512: VariantResult,
    customTerrarium: VariantResult | null,
  ): string {
    if (this.hasPositiveElevation(direct256)) {
      return 'direct256';
    }

    if (this.hasPositiveElevation(tilejson256)) {
      return 'tilejson256';
    }

    if (this.hasPositiveElevation(tilejson512)) {
      return 'tilejson512';
    }

    if (customTerrarium && this.hasPositiveElevation(customTerrarium)) {
      return 'customTerrarium';
    }

    return 'none';
  }

  private buildCauseProbable(
    direct256: VariantResult,
    tilejson256: VariantResult,
    tilejson512: VariantResult,
    customTerrarium: VariantResult | null,
  ): string {
    if (this.hasPositiveElevation(direct256)) {
      return 'El DEM local funciona directamente con tiles 256 y el problema restante está en la integración de mapa-tres-d.ts.';
    }

    if (this.hasPositiveElevation(tilejson256)) {
      return 'El DEM local necesita TileJSON 256 para que MapLibre resuelva correctamente el source.';
    }

    if (this.hasPositiveElevation(tilejson512)) {
      return 'El DEM local necesita TileJSON 512 para que MapLibre resuelva correctamente el source.';
    }

    if (customTerrarium && this.hasPositiveElevation(customTerrarium)) {
      return 'El decoder Terrarium interno de MapLibre no está interpretando el DEM local como se espera; la variante custom sí corrige la lectura.';
    }

    return 'Ninguna variante local produjo elevación positiva; el problema sigue en la lectura o interpretación del DEM local dentro de MapLibre.';
  }

  private buildNextChangeRecommendation(
    direct256: VariantResult,
    tilejson256: VariantResult,
    tilejson512: VariantResult,
    customTerrarium: VariantResult | null,
  ): string {
    if (this.hasPositiveElevation(direct256)) {
      return 'Copiar la configuración DIRECT 256 al flujo real de mapa-tres-d.ts.';
    }

    if (this.hasPositiveElevation(tilejson256)) {
      return 'Usar TileJSON 256 en el componente real.';
    }

    if (this.hasPositiveElevation(tilejson512)) {
      return 'Usar TileJSON 512 en el componente real.';
    }

    if (customTerrarium && this.hasPositiveElevation(customTerrarium)) {
      return 'Cambiar el decoder del source local a custom Terrarium en el flujo real.';
    }

    return 'Seguir con una revisión puntual del formato/decoder del DEM local antes de tocar mapa-tres-d.ts.';
  }

  private simplifyVariant(result: VariantResult): VariantSummary {
    return {
      elevation5: result.elevation5,
      elevation10: result.elevation10,
      elevation20: result.elevation20,
      terrain: result.terrain
        ? {
            source: result.terrain.source,
            exaggeration: result.terrain.exaggeration,
          }
        : null,
      visual: result.visual,
      errors: result.errors.length,
    };
  }

  private emptyVariant(): VariantResult {
    return {
      elevation5: null,
      elevation10: null,
      elevation20: null,
      terrain: null,
      visual: false,
      errors: [],
    };
  }

  private describeMapError(event: unknown): string {
    if (!event || typeof event !== 'object') {
      return String(event);
    }

    const record = event as Record<string, unknown>;
    const error = record['error'];
    if (error instanceof Error) {
      return error.message;
    }

    if (error && typeof error === 'object') {
      const errorRecord = error as Record<string, unknown>;
      const message = errorRecord['message'];
      if (typeof message === 'string') {
        return message;
      }
    }

    const message = record['message'];
    if (typeof message === 'string') {
      return message;
    }

    return JSON.stringify(event);
  }

  private async getMapLibreVersion(): Promise<string> {
    return (maplibregl as { version?: string }).version ?? '5.24.0';
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const timerId = window.setTimeout(() => {
        const index = this.timers.indexOf(timerId);
        if (index >= 0) {
          this.timers.splice(index, 1);
        }
        resolve();
      }, ms);

      this.timers.push(timerId);
    });
  }

  private clearTimers(): void {
    for (const timerId of this.timers) {
      window.clearTimeout(timerId);
    }

    this.timers.length = 0;
  }

  private setStatus(status: string): void {
    (window as Window & { __terrainABStatus?: string }).__terrainABStatus = status;
    console.log('[A/B STATUS]', status);
  }
}
