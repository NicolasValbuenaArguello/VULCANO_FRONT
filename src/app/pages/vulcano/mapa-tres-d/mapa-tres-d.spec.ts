import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { MapaTresD } from './mapa-tres-d';
import { vi } from 'vitest';

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
