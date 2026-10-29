import { Marker } from 'maplibre-gl';
import { vi } from 'vitest';
import { MapLibrePointLayer } from './point-layers';
import { GeographicPointsService, DEFAULT_POINT_STYLE } from './geographic-points';

describe('PUNTOS: ciclo realista de disponibilidad de estilo 3D', () => {
  afterEach(() => vi.restoreAllMocks());
  it('renders preexisting data at style.load while tiles are pending and updates without requiring idle', () => {
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    const state = new GeographicPointsService();
    const first = state.guardar({ nombre: 'A', observaciones: '', latitud: 4.5, longitud: -74.25, ...DEFAULT_POINT_STYLE });
    state.graficar();
    const canvas = document.createElement('div');
    const add = vi.spyOn(Marker.prototype, 'addTo').mockImplementation(function (this: Marker) { canvas.appendChild(this.getElement()); return this; });
    const sources = new Map<string, any>(), layers = new Map<string, any>();
    const map = { isStyleLoaded: () => false, getCanvasContainer: () => canvas,
      getSource: (id: string) => sources.get(id),
      addSource: vi.fn((id, source) => sources.set(id, { data: source.data, setData: vi.fn(function (this: any, data) { this.data = data; }) })),
      getLayer: (id: string) => layers.get(id), addLayer: vi.fn(layer => layers.set(layer.id, layer)),
    };
    const renderer = new MapLibrePointLayer();
    try {
      renderer.sync(map as any, state.geometria());
      expect(sources.size).toBe(0); expect(canvas.children).toHaveLength(0);
      renderer.sync(map as any, state.geometria(), true); // style.load: style graph ready, tiles pending.
      expect(sources.size).toBe(1); expect(layers.size).toBe(2); expect(canvas.children).toHaveLength(1);
      expect(add).toHaveBeenCalledOnce();
      const element = canvas.firstElementChild as HTMLElement;
      expect(element.textContent).toBe('A');
      expect((add.mock.instances[0] as Marker).getLngLat()).toMatchObject({ lng: -74.25, lat: 4.5 });
      expect((add.mock.instances[0] as any)._opacityWhenCovered).toBe('1');
      const source = sources.get(renderer.source);
      renderer.sync(map as any, state.geometria());
      expect(source.setData).not.toHaveBeenCalled(); // Ni bucle de actualizacion ni duplicados.
      state.guardar({ ...first, nombre: 'A editado', marcador: '#ff0000', radio: 1500, opacidad: .7 }, first.id);
      renderer.sync(map as any, state.geometria());
      expect(source.setData).toHaveBeenCalledOnce(); expect(canvas.firstElementChild).toBe(element);
      expect(element.textContent).toBe('A editado'); expect(element.style.backgroundColor).toBe('rgb(255, 0, 0)');
      expect(source.data.features[0].properties.radio).toBe(1500);
      expect(source.data.features[0].properties.opacidad).toBe(.7);
      const second = state.guardar({ ...first, nombre: 'B' }); state.graficar();
      renderer.sync(map as any, state.geometria()); expect(canvas.children).toHaveLength(2);
      renderer.styleLoading(); sources.clear(); layers.clear();
      renderer.sync(map as any, state.geometria()); expect(sources.size).toBe(0);
      renderer.sync(map as any, state.geometria(), true);
      expect(sources.get(renderer.source).data.features).toHaveLength(4);
      expect(canvas.children).toHaveLength(2); expect(add).toHaveBeenCalledTimes(2);
      state.eliminar(first.id); renderer.sync(map as any, state.geometria());
      expect(canvas.children).toHaveLength(1); expect(canvas.textContent).toBe('B');
      expect(sources.get(renderer.source).data.features.map((f: any) => f.id)).toEqual([second.id + '-circle', second.id]);
    } finally { renderer.dispose(); }
    expect(canvas.children).toHaveLength(0);
  });
});
