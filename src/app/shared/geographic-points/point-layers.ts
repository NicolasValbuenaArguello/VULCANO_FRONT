import * as L from 'leaflet';
import { Marker, type Map as MapLibreMap, type GeoJSONSource } from 'maplibre-gl';
import { environment } from '../../../environments/environment';

/** Adaptador Leaflet: reemplaza solo su propia capa, sin tocar poligonos u otras herramientas. */
export class LeafletPointLayer {
  private layer?: L.GeoJSON;
  sync(map: L.Map, data: GeoJSON.FeatureCollection): void {
    this.dispose();
    this.layer = L.geoJSON(data, {
      style: f => ({ color: f?.properties.linea, weight: f?.properties.grosor,
        fillColor: f?.properties.relleno, fillOpacity: f?.properties.opacidad, interactive: false }),
      pointToLayer: (f, position) => L.circleMarker(position, { radius: f.properties.tamano,
        color: '#ffffff', weight: 2, fillColor: f.properties.marcador, fillOpacity: 1, interactive: false }),
    }).addTo(map);
  }
  /** Libera unicamente los objetos de este adaptador. */
  dispose(): void { this.layer?.remove(); this.layer = undefined; }
}

/** Render 3D: anillos sobre terreno y centros DOM legibles; no conserva registros de negocio. */
export class MapLibrePointLayer {
  readonly source = 'puntos-generales';
  private map?: MapLibreMap;
  private styleReady = false;
  private lastData?: GeoJSON.FeatureCollection;
  private readonly markers = new Map<string, Marker>();
  private diagnostic = '';

  /** Marca solo el estilo de PUNTOS pendiente, sin borrar registros o marcadores. */
  styleLoading(): void { this.styleReady = false; this.lastData = undefined; }

  /** Sincroniza el input actual. styleReadyEvent solo se usa desde style.load/load oficiales. */
  sync(map: MapLibreMap, data: GeoJSON.FeatureCollection, styleReadyEvent = false): void {
    if (this.map !== map) { this.dispose(); this.map = map; }
    if (styleReadyEvent || map.isStyleLoaded()) this.styleReady = true;
    if (!this.styleReady) { this.log(data, false); return; }
    const source = map.getSource(this.source) as GeoJSONSource | undefined;
    if (source) {
      if (this.lastData !== data) source.setData(data);
    } else map.addSource(this.source, { type: 'geojson', data });
    if (!map.getLayer(this.source + '-fill')) map.addLayer({ id: this.source + '-fill', type: 'fill', source: this.source,
      filter: ['==', '$type', 'Polygon'], paint: { 'fill-color': ['get', 'relleno'], 'fill-opacity': ['get', 'opacidad'] } });
    if (!map.getLayer(this.source + '-line')) map.addLayer({ id: this.source + '-line', type: 'line', source: this.source,
      filter: ['==', '$type', 'Polygon'], paint: { 'line-color': ['get', 'linea'], 'line-width': ['get', 'grosor'] } });
    // Compatibilidad con un estilo que aun contiene la antigua capa de centros.
    if (map.getLayer(this.source + '-center')) map.removeLayer(this.source + '-center');
    const ids = new Set<string>();
    for (const f of data.features) {
      if (f.geometry.type !== 'Point') continue;
      const id = String(f.id), [lon, lat] = f.geometry.coordinates;
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) continue;
      ids.add(id);
      let marker = this.markers.get(id);
      if (!marker) {
        const element = document.createElement('div');
        element.className = 'puntos-generales-marker-3d';
        element.style.cssText = 'box-sizing:border-box;border:2px solid white;border-radius:50%;pointer-events:none';
        const label = document.createElement('span');
        label.style.cssText = 'position:absolute;bottom:18px;left:50%;transform:translateX(-50%);background:#071007;color:#dce7d0;border:1px solid #72966a;border-radius:3px;padding:2px 5px;font:11px system-ui,sans-serif;white-space:nowrap;pointer-events:none';
        element.appendChild(label);
        marker = new Marker({ element, anchor: 'center', pitchAlignment: 'viewport', rotationAlignment: 'viewport',
          opacity: 1, opacityWhenCovered: 1 }).setLngLat([lon, lat]).addTo(map);
        this.markers.set(id, marker);
      } else marker.setLngLat([lon, lat]);
      const element = marker.getElement(), properties = f.properties ?? {};
      element.style.width = element.style.height = `${2 * Number(properties['tamano'] ?? 6)}px`;
      element.style.backgroundColor = String(properties['marcador'] ?? '#2879eb');
      const name = String(properties['nombre'] || id);
      element.setAttribute('aria-label', name);
      element.firstElementChild!.textContent = name;
      if (element.parentElement !== map.getCanvasContainer()) marker.addTo(map);
    }
    for (const [id, marker] of this.markers) if (!ids.has(id)) { marker.remove(); this.markers.delete(id); }
    this.lastData = data;
    this.log(data, !!map.getSource(this.source) && !!map.getLayer(this.source + '-line'));
  }

  /** Diagnostico de desarrollo con conteos/booleanos; evita repetirlo sin cambios. */
  private log(data: GeoJSON.FeatureCollection, available: boolean): void {
    if (environment.production) return;
    const info = { puntosRecibidos: data.features.filter(f => f.geometry.type === 'Point').length,
      visorInicializado: !!this.map, capaDisponible: available, geometriaProcesada: available };
    const key = JSON.stringify(info);
    if (key !== this.diagnostic) { this.diagnostic = key; console.debug('[PUNTOS][3D]', info); }
  }

  /** Libera exclusivamente marcadores locales; las fuentes se destruyen con el mapa propietario. */
  dispose(): void {
    for (const marker of this.markers.values()) marker.remove();
    this.markers.clear(); this.styleReady = false; this.lastData = undefined; this.map = undefined; this.diagnostic = '';
  }
}
