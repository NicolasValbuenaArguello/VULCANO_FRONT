import { TestBed } from '@angular/core/testing';
import { CARTOGRAPHY_CONFIG, CartographyConfigService, externalCartographyConfig } from './cartography-config.service';
import { CartographyConfig } from '../models/cartography.model';
import { MapaComponent } from '../components/mapa/mapa';
import { MapaTresD } from '../../pages/vulcano/mapa-tres-d/mapa-tres-d';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

describe('Cartography configuration', () => {
  it('retains all five external layers and records CARTO key requirements', () => {
    const service = TestBed.inject(CartographyConfigService);
    expect(service.layers().map(layer => layer.id)).toEqual(['streets', 'satellite', 'topographic', 'light', 'dark']);
    expect(service.layers().filter(layer => layer.requiresApiKey).map(layer => layer.id)).toEqual(['light', 'dark']);
    expect(service.mapLibreLayers().light.tiles).toHaveLength(3);
    expect(service.layers().filter(layer => layer.enabled).map(layer => layer.id)).toEqual(['satellite']);
    expect(service.resolveSelection('dark')).toBe('satellite');
    expect(service.layers().every(layer => layer.type === 'raster')).toBe(true);
  });

  it('shares an explicitly configured internal source across both engines without replacing other layers', () => {
    const config: CartographyConfig = externalCartographyConfig();
    config.layers.streets = { ...config.layers.streets, provider: 'VULCANO',
      enabled: true, tileUrl: '/cartography/v1/tiles/streets/{z}/{x}/{y}.png',
      bounds: [-82, -5, -66, 14], maxZoom: 16 };
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(),
      { provide: CARTOGRAPHY_CONFIG, useValue: config }] });
    const leaflet = TestBed.runInInjectionContext(() => new MapaComponent()) as any;
    const maplibre = TestBed.runInInjectionContext(() => new MapaTresD()) as any;
    const layers = leaflet.buildBaseMapConfigs();
    expect(layers[0].url).toBe(config.layers.streets.tileUrl);
    expect(layers[0].maxZoom).toBe(16);
    expect(maplibre.createBaseMapSourceSpecification('streets')).toMatchObject({
      tiles: [config.layers.streets.tileUrl], bounds: config.layers.streets.bounds, maxzoom: 16,
    });
    expect(layers).toHaveLength(5);
    expect(maplibre.createBaseMapSourceSpecification('satellite').tiles).toEqual([config.layers.satellite.tileUrl]);
    leaflet.tileUrl = 'https://authorized.example/{z}/{x}/{y}.png';
    expect(leaflet.buildBaseMapConfigs()[0].url).toBe(leaflet.tileUrl);
  });
});
