import * as L from 'leaflet';
import { Marker } from 'maplibre-gl';
import type { Map as MapLibreMap, MapMouseEvent, GeoJSONSource } from 'maplibre-gl';
import type { FeatureCollection } from 'geojson';
import { Subscription } from 'rxjs';
import { GeographicPoint, mapActionTarget, validGeographicPoint } from '../map-context-menu/map-actions.service';
import { MeasurementService } from './measurement.service';

/** Captura comun limitada a un frame; cada motor mantiene su picking geografico nativo. */
abstract class CursorAdapter {
  private frame = 0;
  private pending: GeographicPoint | null = null;
  constructor(protected readonly state: MeasurementService) {}

  /** Reduce el trabajo visual a la frecuencia del navegador sin peticiones por evento. */
  protected cursor(point: GeographicPoint | null): void {
    this.pending = point && validGeographicPoint(point) ? point : null;
    if (!this.frame) this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      this.state.updateCursor(this.pending);
    });
  }

  /** Evita actualizaciones posteriores a la destruccion del visor. */
  protected disposeCursor(): void { cancelAnimationFrame(this.frame); }
}

/** Adaptador especifico de Leaflet; no cambia los eventos ni capas ya presentes. */
export class LeafletMeasurementAdapter extends CursorAdapter {
  private readonly layers = L.layerGroup();
  private readonly subscription: Subscription;
  constructor(private readonly map: L.Map, state: MeasurementService) {
    super(state);
    map.on('mousemove', this.mousemove);
    map.on('mouseout', this.mouseout);
    map.on('click', this.click);
    this.layers.addTo(map);
    this.subscription = state.geometry$.subscribe(data => {
      this.layers.clearLayers();
      for (const feature of data.features) {
        if (feature.geometry.type === 'LineString') {
          L.polyline(feature.geometry.coordinates.map(point => L.latLng(point[1], point[0])), { color: '#9daa55', weight: 3, interactive: false }).addTo(this.layers);
        } else if (feature.geometry.type === 'Point') {
          const point = L.latLng(feature.geometry.coordinates[1], feature.geometry.coordinates[0]);
          if (feature.properties?.['role'] === 'point') L.circleMarker(point, { radius: 5, color: '#b5a359', fillColor: '#090e02', fillOpacity: 1, interactive: false }).addTo(this.layers);
          const label = document.createElement('span');
          label.className = 'geo-measurement-label';
          label.textContent = String(feature.properties?.['label'] ?? '');
          L.marker(point, { interactive: false, icon: L.divIcon({ html: label, className: 'geo-measurement-marker', iconSize: undefined, iconAnchor: [0, feature.properties?.['role'] === 'point' ? -8 : 0] }) }).addTo(this.layers);
        }
      }
    });
  }
  /** Usa latlng de Leaflet, normalizando solo copias del mundo fuera del rango convencional. */
  private readonly mousemove = (event: L.LeafletMouseEvent) => {
    if (!mapActionTarget(event.originalEvent?.target ?? null)) return;
    const point = Math.abs(event.latlng.lng) <= 180 ? event.latlng : event.latlng.wrap();
    this.cursor({ latitud: point.lat, longitud: point.lng });
  };
  private readonly mouseout = () => this.cursor(null);
  /** Solo agrega puntos durante una herramienta activa, dejando intacto el clic derecho. */
  private readonly click = (event: L.LeafletMouseEvent) => {
    if (!mapActionTarget(event.originalEvent?.target ?? null)) return;
    const point = Math.abs(event.latlng.lng) <= 180 ? event.latlng : event.latlng.wrap();
    this.state.addPoint({ latitud: point.lat, longitud: point.lng });
  };

  /** Libera exclusivamente listeners propios; las capas originales permanecen intactas. */
  destroy(): void {
    this.map.off('mousemove', this.mousemove);
    this.map.off('mouseout', this.mouseout);
    this.map.off('click', this.click);
    this.subscription.unsubscribe();
    this.layers.remove();
    this.disposeCursor();
  }
}

/** Adaptador especifico de MapLibre con interseccion de superficie, nunca coordenadas de camara. */
export class MapLibreMeasurementAdapter extends CursorAdapter {
  private data: FeatureCollection = { type: 'FeatureCollection', features: [] };
  private readonly sourceId = 'vulcano-geographic-measurements';
  private readonly subscription: Subscription;
  private markers: Marker[] = [];
  constructor(private readonly map: MapLibreMap, state: MeasurementService) {
    super(state);
    map.on('mousemove', this.mousemove);
    map.on('mouseout', this.mouseout);
    map.on('click', this.click);
    map.on('style.load', this.styleLoaded);
    this.subscription = state.geometry$.subscribe(data => { this.data = data; this.render(); });
  }

  /** El cielo y los puntos sin terreno intersectable no generan posiciones ficticias. */
  private point(event: MapMouseEvent): GeographicPoint | null {
    if (!mapActionTarget(event.originalEvent.target) || !this.map.transform.isPointOnMapSurface(event.point, this.map.terrain)) return null;
    const coordinate = this.map.unproject(event.point);
    const point = Math.abs(coordinate.lng) <= 180 ? coordinate : coordinate.wrap();
    return { latitud: point.lat, longitud: point.lng };
  }
  private readonly mousemove = (event: MapMouseEvent) => this.cursor(this.point(event));
  private readonly mouseout = () => this.cursor(null);
  private readonly click = (event: MapMouseEvent) => { const point = this.point(event); if (point) this.state.addPoint(point); };
  private readonly styleLoaded = () => this.render(true);

  /** Reutiliza un source propio y restaura sus capas tras setStyle, sin tocar capas originales. */
  private render(styleLoaded = false): void {
    const source = this.map.getSource(this.sourceId) as GeoJSONSource | undefined;
    if (!source && !styleLoaded && !this.map.isStyleLoaded()) return;
    if (source) source.setData(this.data);
    else this.map.addSource(this.sourceId, { type: 'geojson', data: this.data });
    if (!this.map.getLayer(`${this.sourceId}-lines`)) this.map.addLayer({
      id: `${this.sourceId}-lines`, source: this.sourceId, type: 'line', filter: ['==', ['geometry-type'], 'LineString'],
      paint: { 'line-color': '#9daa55', 'line-width': 3 },
    });
    if (!this.map.getLayer(`${this.sourceId}-points`)) this.map.addLayer({
      id: `${this.sourceId}-points`, source: this.sourceId, type: 'circle',
      filter: ['all', ['==', ['geometry-type'], 'Point'], ['==', ['get', 'role'], 'point']],
      paint: { 'circle-radius': 5, 'circle-color': '#090e02', 'circle-stroke-color': '#b5a359', 'circle-stroke-width': 2 },
    });
    this.markers.forEach(marker => marker.remove());
    this.markers = [];
    for (const feature of this.data.features) {
      if (feature.geometry.type !== 'Point') continue;
      const element = document.createElement('span');
      element.className = 'geo-measurement-label';
      element.textContent = String(feature.properties?.['label'] ?? '');
      this.markers.push(new Marker({ element, offset: [0, feature.properties?.['role'] === 'point' ? 14 : 0] })
        .setLngLat([feature.geometry.coordinates[0], feature.geometry.coordinates[1]]).addTo(this.map));
    }
  }

  /** Elimina listeners al destruir el visor sin modificar sus controles. */
  destroy(): void {
    this.map.off('mousemove', this.mousemove);
    this.map.off('mouseout', this.mouseout);
    this.map.off('click', this.click);
    this.map.off('style.load', this.styleLoaded);
    this.subscription.unsubscribe();
    this.markers.forEach(marker => marker.remove());
    for (const id of [`${this.sourceId}-lines`, `${this.sourceId}-points`]) if (this.map.getLayer(id)) this.map.removeLayer(id);
    if (this.map.getSource(this.sourceId)) this.map.removeSource(this.sourceId);
    this.disposeCursor();
  }
}
