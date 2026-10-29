import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { GisPoligonos } from './gis-poligonos';
import { PoligonosGisService } from '../../shared/gis-polygons/poligonos-gis.service';
const motores = vi.hoisted(() => ({
  limpiar: vi.fn(),
  poligono: vi.fn(),
  setData: vi.fn(),
  addLayer: vi.fn(),
  fuente: false,
  quitar2: vi.fn(),
  quitar3: vi.fn(),
  fit2: vi.fn(),
  fit3: vi.fn(),
}));
vi.mock('leaflet', () => ({
  map: () => ({ fitBounds: motores.fit2, remove: motores.quitar2 }),
  layerGroup: () => ({
    addTo() {
      return this;
    },
    clearLayers: motores.limpiar,
  }),
  polygon: (...args: unknown[]) => {
    motores.poligono(...args);
    return {
      addTo() {
        return this;
      },
      bindTooltip() {
        return this;
      },
    };
  },
  circleMarker: () => ({
    bindTooltip() {
      return this;
    },
    addTo() {
      return this;
    },
  }),
  latLngBounds: (p: unknown) => p,
}));
vi.mock('maplibre-gl', () => ({
  Map: class {
    addControl() {}
    on() {}
    isStyleLoaded() {
      return true;
    }
    getSource() {
      return motores.fuente ? { setData: motores.setData } : undefined;
    }
    addSource() {
      motores.fuente = true;
    }
    addLayer(...args: unknown[]) {
      motores.addLayer(...args);
    }
    fitBounds(...args: unknown[]) {
      motores.fit3(...args);
    }
    remove() {
      motores.quitar3();
    }
  },
  NavigationControl: class {},
  LngLatBounds: class {
    extend() {
      return this;
    }
    getCenter() {
      return { toArray: () => [0.5, 0.5] };
    }
  },
  Marker: class {
    setLngLat() {
      return this;
    }
    addTo() {
      return this;
    }
    remove() {}
  },
}));
const registro = {
  id: 'prueba',
  nombre: '<b>Nombre literal</b>',
  descripcion: '',
  version: 1,
  fecha_creacion: 'fecha',
  fecha_actualizacion: 'fecha',
  srid: 4326 as const,
  vertices: [
    { latitud: 0, longitud: 0 },
    { latitud: 0, longitud: 1 },
    { latitud: 1, longitud: 0 },
  ],
  geometria: {
    type: 'Polygon' as const,
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [0, 1],
        [0, 0],
      ],
    ] as [number, number][][],
  },
  estilo: {
    colorRelleno: '#3498db',
    colorLinea: '#ffffff',
    opacidadRelleno: 0.65,
    opacidadLinea: 1,
    grosorLinea: 2.5,
  },
};
describe('Visores GIS independientes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    motores.fuente = false;
    TestBed.configureTestingModule({
      providers: [
        { provide: PoligonosGisService, useValue: { obtenerPoligonos: () => of([registro]) } },
      ],
    });
  });
  it('applies style, toggles visibility and replaces layers without duplicates', () => {
    const fixture = TestBed.createComponent(GisPoligonos);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    expect(motores.poligono).toHaveBeenCalledWith(
      [
        [0, 0],
        [0, 1],
        [1, 0],
      ],
      expect.objectContaining({ fillOpacity: 0.65, weight: 2.5 }),
    );
    expect(motores.addLayer).toHaveBeenCalledTimes(2);
    c.dibujar();
    expect(motores.addLayer).toHaveBeenCalledTimes(2);
    c.alternar('prueba');
    expect(motores.setData.mock.calls.at(-1)![0].features).toHaveLength(0);
    c.alternar('prueba');
    expect(motores.setData.mock.calls.at(-1)![0].features).toHaveLength(1);
    c.registros = [];
    c.dibujar();
    expect(motores.setData.mock.calls.at(-1)![0].features).toHaveLength(0);
  });
  it('centers using geographic bounds and releases only its own engines', () => {
    const fixture = TestBed.createComponent(GisPoligonos);
    fixture.detectChanges();
    fixture.componentInstance.centrar(registro);
    expect(motores.fit2).toHaveBeenCalled();
    expect(motores.fit3).toHaveBeenCalled();
    fixture.destroy();
    expect(motores.quitar2).toHaveBeenCalledOnce();
    expect(motores.quitar3).toHaveBeenCalledOnce();
  });
});
