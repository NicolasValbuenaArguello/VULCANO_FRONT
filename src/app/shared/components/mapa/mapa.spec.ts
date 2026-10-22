import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ElementoMapa } from '../../models/elemento-mapa.model';
import { TestBed } from '@angular/core/testing';
import * as L from 'leaflet';
import { vi } from 'vitest';
import { camposCoordenadasInvalidos, MapaComponent } from './mapa';
import { SimulacionTrayectoriaResponse } from '../../../core/services/vulcano-api.service';
vi.mock('leaflet', { spy: true });

describe('2D simulation trajectory', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }));
  const simulation = {
    simulacion: true,
    p1: { latitud: 3.425, longitud: -75.425 },
    p2: { latitud: 3.435, longitud: -75.415 },
    perfil_elevacion: [
      { latitud: 3.425, longitud: -75.425 },
      { latitud: 3.431, longitud: -75.421 },
      { latitud: 3.435, longitud: -75.415 },
    ],
  } as SimulacionTrayectoriaResponse;
  afterEach(() => { vi.restoreAllMocks(); vi.clearAllMocks(); });
  const setup = () => {
    const component = TestBed.runInInjectionContext(() => new MapaComponent()) as any;
    const layer = { addTo: vi.fn().mockReturnThis(), setLatLngs: vi.fn().mockReturnThis(), setStyle: vi.fn().mockReturnThis(), remove: vi.fn() };
    const polyline = vi.mocked(L.polyline).mockReturnValue(layer as unknown as L.Polyline);
    return { component, layer, polyline };
  };

  it('keeps pending input and renders the exact backend path once a map is available', () => {
    const { component, layer, polyline } = setup();
    component.simulacionTrayectoria = simulation;
    component.renderRelacion();
    expect(polyline).not.toHaveBeenCalled();
    component.map = {};
    component.renderRelacion();
    const points = polyline.mock.calls[0][0] as L.LatLng[];
    expect(points.map(p => [p.lat, p.lng])).toEqual([[3.425, -75.425], [3.431, -75.421], [3.435, -75.415]]);
    expect(polyline.mock.calls[0][1]).toMatchObject({ pane: 'overlayPane', weight: 4, dashArray: '', interactive: false });
    for (let i = 0; i < 4; i++) component.renderRelacion();
    expect(polyline).toHaveBeenCalledOnce();
    expect(layer.setLatLngs).toHaveBeenCalledTimes(4);
    expect(layer.remove).not.toHaveBeenCalled();
  });

  it('filters invalid samples, anchors missing endpoints and clears stale paths', () => {
    const { component, layer, polyline } = setup();
    component.map = {};
    component.simulacionTrayectoria = { ...simulation, perfil_elevacion: [
      { latitud: NaN, longitud: -75 }, null,
      { latitud: 3.427, longitud: -75.423 }, { latitud: 3.433, longitud: -75.417 },
    ] };
    component.renderRelacion();
    const points = polyline.mock.calls[0][0] as L.LatLng[];
    expect(points.map(p => [p.lat, p.lng])).toEqual([[3.425, -75.425], [3.427, -75.423], [3.433, -75.417], [3.435, -75.415]]);
    component.simulacionTrayectoria = { ...simulation, p1: null };
    component.renderRelacion();
    expect(layer.remove).toHaveBeenCalledOnce();
    expect(component.relacionLayer).toBeNull();
  });

  it('updates the existing fixed-relation layer after successful simulation without duplication', () => {
    const { component, layer, polyline } = setup();
    component.map = {};
    component.relacionFijada = { origen: simulation.p1, destino: simulation.p2 };
    component.renderRelacion();
    expect(polyline.mock.calls[0][1]).toMatchObject({ dashArray: '8 5' });
    component.simulacionTrayectoria = simulation;
    component.ngOnChanges({ simulacionTrayectoria: {} });
    expect(polyline).toHaveBeenCalledOnce();
    expect(layer.setStyle).toHaveBeenCalledWith(expect.objectContaining({ dashArray: '', weight: 4 }));
    expect(layer.setLatLngs).toHaveBeenCalledOnce();
  });
});

const elementoBase: ElementoMapa = {
  idTemporal: 'test',
  latitud: 4.5709,
  longitud: -74.2973,
  hemisferioLatitud: 'LN',
  hemisferioLongitud: 'LW',
  coordenadasDms: {
    latitud: { grados: 4, minutos: 34, segundos: 15 },
    longitud: { grados: 74, minutos: 17, segundos: 50 },
  },
  icono: 'icono.png',
  imagen: null,
  fechaCreacion: '2026-09-30T00:00:00.000Z',
};

describe('camposCoordenadasInvalidos', () => {
  it.each([
    [null, -74.2973, ['latitud']],
    [undefined, -74.2973, ['latitud']],
    [Number.NaN, -74.2973, ['latitud']],
    ['', -74.2973, ['latitud']],
    [4.5709, null, ['longitud']],
    [4.5709, undefined, ['longitud']],
    [4.5709, Number.NaN, ['longitud']],
    [4.5709, '', ['longitud']],
    [4.5709, -74.2973, []],
  ])('valida (%p, %p)', (latitud, longitud, esperado) => {
    const elemento = {
      ...elementoBase,
      latitud,
      longitud,
    } as unknown as ElementoMapa;

    expect(camposCoordenadasInvalidos(elemento)).toEqual(esperado);
  });

  it('keeps three Leaflet markers by ID and never creates one for invalid coordinates', () => {
    const component = TestBed.runInInjectionContext(() => new MapaComponent()) as any;
    const marker = {
      addTo: vi.fn().mockReturnThis(),
      setLatLng: vi.fn(),
      remove: vi.fn(),
    };
    const markerSpy = vi.mocked(L.marker).mockReturnValue(marker as unknown as L.Marker);
    vi.mocked(L.icon).mockReturnValue({} as L.Icon);
    component.map = { getZoom: () => 6, flyTo: vi.fn() };
    component.suppressInitialElementFocus = true;

    const p1 = { ...elementoBase, idTemporal: 'P1' };
    const p2 = { ...elementoBase, idTemporal: 'P2', latitud: 4.571, longitud: -74.298 };
    const p3 = { ...elementoBase, idTemporal: 'P3', latitud: 4.572, longitud: -74.299 };
    component.renderElementos([p1]);
    expect(component.elementoMarkers.size).toBe(1);
    component.renderElementos([p1, p2]);
    expect(component.elementoMarkers.size).toBe(2);
    component.renderElementos([p1, p2, p3]);
    expect(component.elementoMarkers.size).toBe(3);
    component.renderElementos([p1, p2, p3, { ...elementoBase, idTemporal: 'bad', latitud: Number.NaN }]);
    expect(component.elementoMarkers.size).toBe(3);
    expect(markerSpy).toHaveBeenCalledTimes(3);
    for (const [coordinates] of markerSpy.mock.calls) {
      const [lat, lng] = coordinates as [number, number];
      expect(Number.isFinite(lat)).toBe(true);
      expect(Number.isFinite(lng)).toBe(true);
    }
  });
});
