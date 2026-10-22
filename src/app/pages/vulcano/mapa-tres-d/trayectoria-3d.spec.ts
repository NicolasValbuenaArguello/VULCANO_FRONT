import { construirTrayectoria3D } from './trayectoria-3d';
import { SimulacionTrayectoriaResponse } from '../../../core/services/vulcano-api.service';

describe('Backend trajectory geometry', () => {
  const response = {
    simulacion: true,
    p1: { id: 'p1', latitud: 3.425, longitud: -75.425, elevacion_msnm: 1000 },
    p2: { id: 'p2', latitud: 3.435, longitud: -75.415, elevacion_msnm: 1100 },
    apogeo: { latitud: 3.4301, longitud: -75.4201, altitud_visual_msnm: 1500 },
    datos_simulados: { apogeo_visual_m: 400 },
    perfil_elevacion: [
      { factor: 0, latitud: 3.425, longitud: -75.425, terreno_msnm: 1000 },
      { factor: 0.25, latitud: 3.428, longitud: -75.422, terreno_msnm: 1010 },
      { factor: 1, latitud: 3.435, longitud: -75.415, terreno_msnm: 1100 },
    ],
  } as SimulacionTrayectoriaResponse;

  it('anchors 121 finite elevated points to P1, backend apogee and P2', () => {
    const points = construirTrayectoria3D(response);
    expect(points).toHaveLength(121);
    expect(points[0]).toEqual([-75.425, 3.425, 1000]);
    expect(points[60]).toEqual([-75.4201, 3.4301, 1500]);
    expect(points.at(-1)).toEqual([-75.415, 3.435, 1100]);
    expect(points[30].slice(0, 2)).toEqual([-75.422, 3.428]);
    expect(points.every(point => point.every(Number.isFinite))).toBe(true);
    expect(points[30][2]).toBeGreaterThan(1010);
  });

  it('rejects invalid responses without retaining stale geometry', () => {
    for (const invalid of [
      { ...response, simulacion: false }, { ...response, p1: null },
      { ...response, perfil_elevacion: [] },
      { ...response, p2: { ...response.p2, elevacion_msnm: NaN } },
      { ...response, perfil_elevacion: [{ ...response.perfil_elevacion[0], terreno_msnm: null }, response.perfil_elevacion[1]] },
    ]) expect(construirTrayectoria3D(invalid as unknown as SimulacionTrayectoriaResponse)).toEqual([]);
  });
});
