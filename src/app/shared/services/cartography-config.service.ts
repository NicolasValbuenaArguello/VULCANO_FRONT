import { Injectable, InjectionToken, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import { BaseMapId, CartographyConfig, RasterBaseMap } from '../models/cartography.model';

/** Conserva las cinco capas actuales hasta autorizar un proveedor y sus condiciones. */
export function externalCartographyConfig(): CartographyConfig {
  const layer = (id: BaseMapId, name: string, provider: string, tileUrl: string,
    attribution: string, maxZoom: number, requiresApiKey = false, subdomains?: string[]): RasterBaseMap => ({
    id, name, provider, type: 'raster', tileUrl, attribution, maxZoom, requiresApiKey,
    enabled: id === 'satellite',
    tileSize: 256, minZoom: 0, subdomains,
  });
  return { layers: {
    streets: layer('streets', 'Calles', 'OpenStreetMap', environment.map.tileUrl, environment.map.attribution, 19),
    satellite: layer('satellite', 'Satelital', 'Esri World Imagery', environment.map.satellite, 'Tiles © Esri', 19),
    topographic: layer('topographic', 'Topográfico', 'OpenTopoMap', environment.map.topographic,
      'Map data: © OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap (CC-BY-SA)', 17, false, ['a', 'b', 'c']),
    light: layer('light', 'Claro', 'CARTO Light', environment.map.light, '© OpenStreetMap contributors © CARTO', 20, true, ['a', 'b', 'c']),
    dark: layer('dark', 'Oscuro', 'CARTO Dark', environment.map.dark, '© OpenStreetMap contributors © CARTO', 20, true, ['a', 'b', 'c']),
  } };
}

/** Sobrescribir en los providers del arranque para un despliegue LAN o internet. */
export const CARTOGRAPHY_CONFIG = new InjectionToken<CartographyConfig>('CARTOGRAPHY_CONFIG', {
  providedIn: 'root', factory: externalCartographyConfig,
});

/** Adaptacion local sin HTTP, sondeos, claves inventadas ni conmutacion ante bloqueos. */
@Injectable({ providedIn: 'root' })
export class CartographyConfigService {
  private readonly config = inject(CARTOGRAPHY_CONFIG);

  /** La politica central impide activar proveedores temporalmente deshabilitados. */
  isEnabled(id: BaseMapId): boolean { return this.config.layers[id]?.enabled === true; }

  /** Descarta selecciones anteriores deshabilitadas sin consultar sus proveedores. */
  resolveSelection(id?: BaseMapId): BaseMapId {
    if (id && this.isEnabled(id)) return id;
    if (this.isEnabled('satellite')) return 'satellite';
    const fallback = this.layers().find(layer => layer.enabled);
    if (!fallback) throw new Error('No hay mapas base habilitados en CARTOGRAPHY_CONFIG.');
    return fallback.id;
  }

  /** Devuelve una copia para que cada motor conserve independiente su estado visual. */
  layers(): RasterBaseMap[] {
    return (['streets', 'satellite', 'topographic', 'light', 'dark'] as const).map(id => {
      const layer = this.config.layers[id];
      return { ...layer, subdomains: layer.subdomains ? [...layer.subdomains] : undefined,
        bounds: layer.bounds ? [...layer.bounds] : undefined };
    });
  }

  /** MapLibre recibe URLs concretas; Leaflet conserva su expansion nativa de subdominios. */
  mapLibreLayers(): Record<BaseMapId, RasterBaseMap & { tiles: string[] }> {
    return Object.fromEntries(this.layers().map(layer => [layer.id, {
      ...layer,
      tiles: layer.tileUrl.includes('{s}')
        ? (layer.subdomains ?? ['a', 'b', 'c']).map(domain => layer.tileUrl.replace('{s}', domain))
        : [layer.tileUrl],
    }])) as Record<BaseMapId, RasterBaseMap & { tiles: string[] }>;
  }
}
