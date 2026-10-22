import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BehaviorSubject, Subject, Subscription, fromEvent, switchMap, timer, of, from, mergeMap, toArray, map, finalize } from 'rxjs';
import type { Feature, FeatureCollection } from 'geojson';
import { CursorCoordinates, GeographicMeasurement, MeasurementTool } from './measurement.models';
import { GeographicPoint, validGeographicPoint } from '../map-context-menu/map-actions.service';
import { nationalCoordinates, horizontalDistance, geographicAngle, formatDistance, interpolateGeographic, spatialDistance } from './geographic-math';
import { TerrainElevationService } from './terrain-elevation.service';

/** Estado geografico compartido; las mediciones no pertenecen al estilo ni al motor del mapa. */
@Injectable({ providedIn: 'root' })
export class MeasurementService {
  readonly tool = signal<MeasurementTool | null>(null);
  readonly measurements = signal<readonly GeographicMeasurement[]>([]);
  readonly draft = signal<readonly GeographicPoint[]>([]);
  readonly draftDistance = computed(() => this.draft().slice(1).reduce((sum, point, index) => sum + horizontalDistance(this.draft()[index], point), 0));
  readonly cursor = signal<CursorCoordinates | null>(null);
  private sequence = 0;
  private readonly geometry = new BehaviorSubject<FeatureCollection>({ type: 'FeatureCollection', features: [] });
  readonly geometry$ = this.geometry.asObservable();
  private readonly destroyRef = inject(DestroyRef);
  private readonly terrain = inject(TerrainElevationService);
  private readonly cursorRequests = new Subject<GeographicPoint | null>();
  private readonly requests = new Map<string, Subscription>();

  /** La geometria depende de clics y resultados, nunca de cada movimiento del cursor. */
  constructor() {
    effect(() => this.geometry.next(this.features()));
    fromEvent<KeyboardEvent>(document, 'keydown').pipe(takeUntilDestroyed()).subscribe(event => {
      if (event.key === 'Escape' && this.tool()) this.cancel();
    });
    this.destroyRef.onDestroy(() => this.geometry.complete());
    this.cursorRequests.pipe(
      switchMap(point => point ? timer(450).pipe(switchMap(() => this.terrain.get(point))) : of(null)),
      takeUntilDestroyed(),
    ).subscribe(height => this.cursor.update(cursor => cursor ? { ...cursor, elevation: height, loading: false } : null));
    this.destroyRef.onDestroy(() => this.cancelRequests());
  }

  /** Publica coordenadas reales; no consulta el backend por cada movimiento del raton. */
  updateCursor(point: GeographicPoint | null): void {
    this.cursor.set(point ? { point, projected: nationalCoordinates(point.longitud, point.latitud), elevation: null, loading: true } : null);
    this.cursorRequests.next(point);
  }

  /** Seleccion por clic izquierdo; cada herramienta decide cuando completar su geometria. */
  addPoint(point: GeographicPoint): void {
    const tool = this.tool();
    if (!tool || !validGeographicPoint(point)) return;
    const points = [...this.draft(), { ...point }];
    this.draft.set(points);
    const required = tool === 'elevation' ? 1 : tool === 'angle' ? 3 : 2;
    if (tool !== 'route' && points.length === required) this.complete(tool, points);
  }

  /** Termina un recorrido solo por accion explicita, con al menos dos puntos. */
  finishRoute(): void { if (this.tool() === 'route' && this.draft().length >= 2) this.complete('route', [...this.draft()]); }

  /** Deshacer modifica unicamente la seleccion en curso. */
  undo(): void { this.draft.update(points => points.slice(0, -1)); }

  /** Calcula medidas al completar la seleccion; no envia ni guarda elementos cartograficos. */
  private complete(tool: MeasurementTool, points: GeographicPoint[]): void {
    const segments = points.slice(1).map((point, index) => horizontalDistance(points[index], point));
    const angle = tool === 'angle' ? geographicAngle(points[0], points[1], points[2]) : null;
    const measurement: GeographicMeasurement = {
      id: `measurement-${++this.sequence}`, tool, points, segments, horizontal: segments.reduce((sum, value) => sum + value, 0),
      angle, loading: false, samples: [], spatial: null, relief: null,
      message: tool === 'angle' && angle === null ? 'Ángulo no definido: puntos coincidentes o antipodales' : '',
      minimum: null, maximum: null, heightDifference: null, chart: '',
    };
    this.measurements.update(values => [...values, measurement]);
    this.draft.set([]);
    if (tool === 'elevation') {
      this.patch(measurement.id, { loading: true });
      const subscription = this.terrain.get(points[0]).pipe(finalize(() => this.requests.delete(measurement.id))).subscribe(height => this.patch(measurement.id, {
        loading: false, samples: [{ ...points[0], ...height, distance: 0 }],
        message: height.metres === null ? 'Elevación no disponible' : '',
      }));
      if (!subscription.closed) this.requests.set(measurement.id, subscription);
    }
    if (tool === 'profile') this.loadTerrain(measurement.id, true);
  }

  /** Consulta explicita: dos extremos para recta espacial o hasta 33 muestras para relieve/perfil. */
  loadTerrain(id: string, relief: boolean): void {
    const measurement = this.measurements().find(value => value.id === id);
    if (!measurement || measurement.loading) return;
    if (measurement.horizontal <= 0) { this.patch(id, { message: 'Perfil no disponible: seleccione puntos distintos' }); return; }
    const count = relief ? Math.min(33, Math.max(2, Math.ceil(measurement.horizontal / 100) + 1)) : 2;
    const locations: { point: GeographicPoint; distance: number }[] = [];
    for (let i = 0; i < count; i++) {
      const distance = measurement.horizontal * i / (count - 1);
      let segment = 0, cumulative = 0;
      while (segment < measurement.segments.length - 1 && cumulative + measurement.segments[segment] < distance) cumulative += measurement.segments[segment++];
      const fraction = measurement.segments[segment] ? Math.max(0, Math.min(1, (distance - cumulative) / measurement.segments[segment])) : 0;
      const point = interpolateGeographic(measurement.points[segment], measurement.points[segment + 1], fraction);
      if (!point) { this.patch(id, { message: 'Perfil no disponible: trayectoria geográfica ambigua' }); return; }
      locations.push({ point, distance });
    }
    this.patch(id, { loading: true, message: '' });
    const subscription = from(locations).pipe(
      mergeMap(location => this.terrain.get(location.point).pipe(map(height => ({ ...location.point, ...height, distance: location.distance }))), 4),
      toArray(), finalize(() => this.requests.delete(id)),
    ).subscribe(values => {
      const samples = values.sort((a, b) => a.distance - b.distance);
      if (samples.some(sample => sample.metres === null)) {
        this.patch(id, { loading: false, samples, spatial: null, relief: null, minimum: null, maximum: null, heightDifference: null, chart: '', message: 'Elevación no disponible: faltan muestras DEM para completar la consulta' });
        return;
      }
      if (samples.some(sample => sample.source !== samples[0].source || sample.verticalDatum !== samples[0].verticalDatum)) {
        this.patch(id, { loading: false, samples, spatial: null, relief: null, minimum: null, maximum: null, heightDifference: null, chart: '', message: 'Perfil no disponible: fuentes o referencias verticales incompatibles' });
        return;
      }
      const heights = samples.map(sample => sample.metres!);
      const minimum = Math.min(...heights), maximum = Math.max(...heights);
      const terrainLength = samples.slice(1).reduce((sum, sample, index) => sum + Math.hypot(sample.distance - samples[index].distance, sample.metres! - samples[index].metres!), 0);
      const chart = samples.map(sample => `${(12 + sample.distance / measurement.horizontal * 276).toFixed(2)},${(110 - (sample.metres! - minimum) / Math.max(1, maximum - minimum) * 90).toFixed(2)}`).join(' ');
      this.patch(id, { loading: false, samples, minimum, maximum, heightDifference: heights.at(-1)! - heights[0], chart,
        spatial: measurement.tool === 'route' ? null : spatialDistance(samples[0], heights[0], samples.at(-1)!, heights.at(-1)!),
        relief: relief ? terrainLength : null,
        message: `Estimación DEM: ${samples.length} muestras · ${samples[0].verticalDatum}. Sin transformación de datum vertical.`,
      });
    });
    if (!subscription.closed) this.requests.set(id, subscription);
  }

  /** Actualiza un resultado sin afectar mediciones canceladas o ya eliminadas. */
  private patch(id: string, patch: Partial<GeographicMeasurement>): void {
    this.measurements.update(values => values.map(value => value.id === id ? { ...value, ...patch } : value));
  }

  /** Cancela consultas explicitas al limpiar o destruir, para no aplicar resultados obsoletos. */
  private cancelRequests(): void {
    // Retirar primero trabajos recientes en cola evita iniciarlos al liberar una consulta anterior.
    [...this.requests.values()].reverse().forEach(request => request.unsubscribe());
    this.requests.clear();
  }

  /** Coleccion unica compartida, con etiquetas para tramos, puntos y angulos. */
  private readonly features = computed<FeatureCollection>(() => {
    const features: Feature[] = [];
    const append = (id: string, points: readonly GeographicPoint[], angle: number | null) => {
      if (points.length >= 2) features.push({ type: 'Feature', properties: { role: 'line', id }, geometry: { type: 'LineString', coordinates: points.map(point => [point.longitud, point.latitud]) } });
      points.forEach((point, index) => features.push({ type: 'Feature', properties: { role: 'point', id, label: `P${index + 1}` }, geometry: { type: 'Point', coordinates: [point.longitud, point.latitud] } }));
      points.slice(1).forEach((point, index) => {
        const midpoint = interpolateGeographic(points[index], point, .5);
        if (midpoint) features.push({ type: 'Feature', properties: { role: 'label', label: formatDistance(horizontalDistance(points[index], point)), id }, geometry: { type: 'Point', coordinates: [midpoint.longitud, midpoint.latitud] } });
      });
      if (angle !== null) features.push({ type: 'Feature', properties: { role: 'label', label: `${angle.toFixed(2)}°`, id }, geometry: { type: 'Point', coordinates: [points[1].longitud, points[1].latitud] } });
    };
    this.measurements().forEach(value => append(value.id, value.points, value.angle));
    append('draft', this.draft(), null);
    return { type: 'FeatureCollection', features };
  });

  /** Activa una herramienta; las mediciones terminadas permanecen visibles. */
  start(tool: MeasurementTool): void { this.cancel(); this.tool.set(tool); }

  /** Escape cancela solo la seleccion actual, nunca borra las mediciones terminadas. */
  cancel(): void { this.tool.set(null); this.draft.set([]); }

  /** Limpieza explicita independiente de las capas y los elementos guardados del usuario. */
  clear(): void { this.cancel(); this.cancelRequests(); this.measurements.set([]); }
}
