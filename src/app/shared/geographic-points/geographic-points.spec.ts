import { TestBed } from '@angular/core/testing';
import { DEFAULT_POINT_STYLE, GeographicPointsService, geographicCircle, fromDms, toDms } from './geographic-points';
import { horizontalDistance } from '../components/geographic-measurement/geographic-math';
import { MapLibrePointLayer, LeafletPointLayer } from './point-layers';
import * as L from 'leaflet';
import { vi } from 'vitest';
import { Marker } from 'maplibre-gl';

describe('Puntos geograficos generales', () => {
  const point = { nombre: 'A', observaciones: 'Nota', latitud: 4.5, longitud: -74.25, ...DEFAULT_POINT_STYLE };
  it('keeps independent records, edits plotted styles and removes only the requested ID', () => {
    const state = new GeographicPointsService();
    const a = state.guardar(point), b = state.guardar({ ...point, nombre: 'B', radio: 1000, relleno: '#ffffff' });
    expect(a.id).not.toBe(b.id);
    expect(state.geometria().features).toHaveLength(0);
    state.graficar(); state.graficar();
    expect(state.geometria().features).toHaveLength(4);
    state.guardar({ ...point, opacidad: .75 }, a.id);
    expect(state.geometria().features[0].properties?.['opacidad']).toBe(.75);
    expect(state.registros()[1].radio).toBe(1000);
    expect(state.registros()[1].relleno).toBe('#ffffff');
    state.eliminar(a.id);
    expect(state.registros().map(p => p.id)).toEqual([b.id]);
    expect(state.geometria().features).toHaveLength(2);
  });
  it('captures one valid geographic location without registering and ignores invalid picks', () => {
    const state = new GeographicPointsService();
    expect(state.capturar(point)).toBe(false);
    state.captura.set(true);
    expect(state.capturar({ latitud: NaN, longitud: 0 })).toBe(false);
    expect(state.captura()).toBe(true);
    expect(state.capturar(point)).toBe(true);
    expect(state.captura()).toBe(false);
    expect(state.registros()).toHaveLength(0);
    expect(state.geometria().features[0].geometry).toEqual({ type: 'Point', coordinates: [-74.25, 4.5] });
  });
  it('rejects absent coordinates, invalid styles and empty names', () => {
    const state = new GeographicPointsService();
    for (const delta of [{ nombre: ' ' }, { latitud: null }, { longitud: 181 }, { radio: 0 }, { radio: Infinity }, { opacidad: 2 }, { linea: 'red' }]) {
      expect(() => state.guardar({ ...point, ...delta } as any)).toThrow();
    }
    expect(state.registros()).toHaveLength(0);
  });
  it('round trips both hemispheres and carries DMS without accepting invalid degrees', () => {
    for (const value of [0, 4.567891, -33.125, 90, -90]) expect(fromDms(toDms(value, true), true)).toBeCloseTo(value, 9);
    for (const value of [-180, -74.25, 151.75, 180]) expect(fromDms(toDms(value, false), false)).toBeCloseTo(value, 9);
    expect(toDms(4 + 59 / 60 + 59.9999999 / 3600, true)).toMatchObject({ grados: 5, minutos: 0, segundos: 0 });
    expect(fromDms({ hemisferio: 'N', grados: 90, minutos: 1, segundos: 0 }, true)).toBeNull();
  });
  it('constructs a closed metric circle at the configured distance', () => {
    const ring = geographicCircle(point, 1000).coordinates[0];
    expect(ring).toHaveLength(97);
    expect(ring[0]).toEqual(ring.at(-1));
    for (const [longitud, latitud] of ring) expect(horizontalDistance(point, { latitud, longitud })).toBeCloseTo(1000, 5);
  });
  it('uses one MapLibre source and two circle layers and restores after style replacement', () => {
    const state = new GeographicPointsService(); state.guardar(point); state.graficar();
    const sources = new Map(), layers = new Map();
    const canvas = document.createElement('div');
    const addMarker = vi.spyOn(Marker.prototype, 'addTo').mockImplementation(function (this: Marker) { canvas.appendChild(this.getElement()); return this; });
    const map = { isStyleLoaded: () => true, getSource: (id: string) => sources.get(id),
      getCanvasContainer: () => canvas,
      addSource: vi.fn((id, value) => sources.set(id, { data: value.data, setData(data: unknown) { this.data = data; } })),
      getLayer: (id: string) => layers.get(id), addLayer: vi.fn(layer => layers.set(layer.id, layer)) };
    const renderer = new MapLibrePointLayer();
    renderer.sync(map as any, state.geometria()); renderer.sync(map as any, state.geometria());
    expect(map.addSource).toHaveBeenCalledOnce(); expect(map.addLayer).toHaveBeenCalledTimes(2);
    expect(sources.get(renderer.source).data.features).toHaveLength(2);
    sources.clear(); layers.clear(); renderer.sync(map as any, state.geometria());
    expect(layers.size).toBe(2);
    expect(canvas.children).toHaveLength(1);
    renderer.dispose(); addMarker.mockRestore();
  });
  it('renders circles and markers in Leaflet without removing an unrelated polygon', () => {
    const host = document.createElement('div'); document.body.appendChild(host);
    const map = L.map(host, { center: [4.5, -74.25], zoom: 10 });
    const other = L.polygon([[4, -74], [5, -74], [5, -75]]).addTo(map);
    const state = new GeographicPointsService(); state.guardar(point); state.graficar();
    const renderer = new LeafletPointLayer();
    try {
      renderer.sync(map, state.geometria());
      const count = () => { let n = 0; map.eachLayer(() => n++); return n; };
      const before = count(); renderer.sync(map, state.geometria());
      expect(count()).toBe(before); expect(map.hasLayer(other)).toBe(true);
      renderer.dispose(); expect(map.hasLayer(other)).toBe(true);
    } finally { map.remove(); host.remove(); }
  });
});
