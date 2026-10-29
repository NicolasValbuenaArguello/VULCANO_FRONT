import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { MapaTresD } from './mapa-tres-d';
import { vi } from 'vitest';
import { environment } from '../../../../environments/environment';
import { Marker } from 'maplibre-gl';
import { GeographicPointsService, DEFAULT_POINT_STYLE } from '../../../shared/geographic-points/geographic-points';

describe('MapaTresD', () => {
  let component: MapaTresD;
  let fixture: ComponentFixture<MapaTresD>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MapaTresD],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(MapaTresD);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('recovers points received before initialization from the existing style.load event with tiles pending', () => {
    const instance = component as any;
    const state = new GeographicPointsService();
    state.guardar({ nombre: 'Antes de 3D', observaciones: '', latitud: 4, longitud: -73, ...DEFAULT_POINT_STYLE });
    state.graficar(); instance.puntosGeograficos = state.geometria();
    instance.ngOnChanges({ puntosGeograficos: {} }); // No hay mapa todavia: el input permanece disponible.
    const canvas = document.createElement('div'), sources = new Map(), layers = new Map(), handlers = new Map();
    const add = vi.spyOn(Marker.prototype, 'addTo').mockImplementation(function (this: Marker) { canvas.appendChild(this.getElement()); return this; });
    const map = { isStyleLoaded: () => false, getStyle: () => ({ sources: {}, layers: [] }), getCanvasContainer: () => canvas,
      getSource: (id: string) => sources.get(id), addSource: (id: string, source: any) => sources.set(id, { ...source, setData(data: unknown) { this.data = data; } }),
      getLayer: (id: string) => layers.get(id), addLayer: (layer: any) => layers.set(layer.id, layer),
      on: (event: string, handler: Function) => handlers.set(event, handler) };
    instance.map = map; instance.terrainDiagnosticMode = true;
    const perf = vi.spyOn(instance, 'logMapPerformance').mockImplementation(() => {});
    const log = vi.spyOn(instance, 'logStyleState').mockImplementation(() => {});
    try {
      instance.bindMapEvents(); handlers.get('style.load')();
      expect(canvas.children).toHaveLength(1); expect(sources.get('puntos-generales').data.features).toHaveLength(2);
      handlers.get('styledataloading')(); sources.clear(); layers.clear(); handlers.get('style.load')();
      expect(canvas.children).toHaveLength(1); expect(layers.size).toBe(2); expect(add).toHaveBeenCalledOnce();
    } finally { instance.puntosLayer.dispose(); instance.map = null; add.mockRestore(); perf.mockRestore(); log.mockRestore(); }
  });

  it('retains both finalized polygons and their styles after repeated rendering and style replacement', () => {
    const instance = component as any;
    const polygon = (id: string, color: string) => ({ type: 'Feature', id,
      properties: { nombre: id, descripcion: '', estilo: {
        colorRelleno: color, colorLinea: '#ffffff', opacidadRelleno: .65, opacidadLinea: 1, grosorLinea: 2.5,
      } }, geometry: { type: 'Polygon', coordinates: [[[-74, 4], [-73, 4], [-73, 5], [-74, 4]]] },
    });
    const sources = new Map<string, any>(), layers = new Map<string, any>();
    const map = {
      isStyleLoaded: () => true, getSource: (id: string) => sources.get(id),
      addSource: vi.fn((id, source) => sources.set(id, { data: source.data, setData(data: unknown) { this.data = data; } })),
      getLayer: (id: string) => layers.get(id), addLayer: vi.fn(layer => layers.set(layer.id, layer)),
      fitBounds: vi.fn(), triggerRepaint: vi.fn(),
    };
    instance.map = map;
    try {
      instance.poligonosLimites = [polygon('A', '#123456'), polygon('B', '#abcdef')];
      instance.sincronizarLimitesSeguridad(); instance.sincronizarLimitesSeguridad();
      expect(map.addSource).toHaveBeenCalledOnce();
      expect(map.addLayer).toHaveBeenCalledTimes(2);
      const data = sources.get('limites-seguridad-source').data;
      expect(data.features.map((p: any) => p.id)).toEqual(['A', 'B']);
      expect(data.features.map((p: any) => p.properties.colorRelleno)).toEqual(['#123456', '#abcdef']);
      sources.clear(); layers.clear(); // MapLibre sustituye el estilo.
      instance.sincronizarLimitesSeguridad();
      expect(sources.get('limites-seguridad-source').data.features).toHaveLength(2);
      expect(layers.size).toBe(2);
    } finally { instance.map = null; }
  });

  it('does not request an OSM probe while its provider is disabled', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Access blocked', {
      status: 418, headers: { 'content-type': 'text/plain' },
    }));
    try {
      const result = await (component as any).fetchBinaryHttpProbe(environment.map.osmProbe, 'OSM TEST');
      expect(fetchSpy).not.toHaveBeenCalled();
      expect(result).toMatchObject({ ok: false, status: 0, contentType: 'disabled' });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('starts with satellite and ignores programmatic selection of disabled providers', () => {
    const instance = component as any;
    expect(instance.activeBaseMapId).toBe('satellite');
    const style = instance.createStyle();
    const rasterSources = Object.values(style.sources).filter((source: any) => source.type === 'raster') as any[];
    expect(rasterSources).toHaveLength(1);
    expect(rasterSources[0].tiles).toEqual([environment.map.satellite]);
    const change = vi.spyOn(instance, 'startPendingBaseMapChange');
    for (const id of ['streets', 'topographic', 'light', 'dark']) instance.changeBaseMap(id);
    expect(change).not.toHaveBeenCalled();
    expect(instance.activeBaseMapId).toBe('satellite');
    const diagnostic = instance.createTerrainControlStyle();
    expect(diagnostic.sources.osm.tiles).toEqual([environment.map.satellite]);
  });

  it('retains pending simulation and restores one layer without repeated camera fits', () => {
    const instance = component as any;
    const sample = (factor: number) => ({ factor, latitud: 3.425 + factor * 0.01, longitud: -75.425 + factor * 0.01, terreno_msnm: 1000 });
    const simulation = {
      simulacion: true,
      p1: { latitud: 3.425, longitud: -75.425, elevacion_msnm: 1000 },
      p2: { latitud: 3.435, longitud: -75.415, elevacion_msnm: 1100 },
      apogeo: { latitud: 3.43, longitud: -75.42, altitud_visual_msnm: 1500 },
      datos_simulados: { apogeo_visual_m: 400 }, perfil_elevacion: [sample(0), sample(1)],
    };
    instance.simulacionTrayectoria = simulation;
    instance.sincronizarTrayectoria3D();
    expect(instance.simulacionTrayectoria).toBe(simulation);
    const layers = new Map<string, any>();
    const map = {
      isStyleLoaded: () => true,
      getLayer: (id: string) => layers.get(id),
      addLayer: vi.fn(layer => layers.set(layer.id, layer)),
      removeLayer: vi.fn(id => layers.delete(id)),
      triggerRepaint: vi.fn(), fitBounds: vi.fn(),
    };
    instance.map = map;
    instance.mapaListo = true;
    instance.vista3DActiva = true;
    instance.sincronizarTrayectoria3D();
    expect(map.addLayer).toHaveBeenCalledOnce();
    expect(map.fitBounds).toHaveBeenCalledOnce();
    const layer = [...layers.values()][0];
    const render = vi.spyOn(instance, 'renderizarTrayectoria3d').mockImplementation(() => {});
    const matrix = new Float32Array(16);
    layer.render({}, { defaultProjectionData: { mainMatrix: matrix }, modelViewProjectionMatrix: new Float32Array(16) });
    expect(render).toHaveBeenCalledWith({}, matrix);
    instance.vista3DActiva = false;
    instance.sincronizarTrayectoria3D();
    instance.vista3DActiva = true;
    instance.sincronizarTrayectoria3D();
    expect(map.addLayer).toHaveBeenCalledOnce();
    expect(map.fitBounds).toHaveBeenCalledOnce();
    layers.clear();
    instance.sincronizarTrayectoria3D();
    expect(map.addLayer).toHaveBeenCalledTimes(2);
    expect(map.fitBounds).toHaveBeenCalledOnce();
    instance.simulacionTrayectoria = null;
    instance.sincronizarTrayectoria3D();
    expect(layers.size).toBe(0);
    expect(instance.trayectoria3dVertices.length).toBe(0);
    instance.map = null;
  });
});
