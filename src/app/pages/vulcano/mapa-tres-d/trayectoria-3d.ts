import { SimulacionTrayectoriaResponse } from '../../../core/services/vulcano-api.service';

export type TrayectoriaPoint = readonly [number, number, number];

export function construirTrayectoria3D(response: SimulacionTrayectoriaResponse): TrayectoriaPoint[] {
  const { p1, p2, apogeo, datos_simulados: datos, perfil_elevacion: perfil } = response;
  const geographic = (point: { latitud: number; longitud: number }) =>
    Number.isFinite(point.latitud) && Math.abs(point.latitud) < 85.051129 &&
    Number.isFinite(point.longitud) && Math.abs(point.longitud) <= 180;
  if (response.simulacion !== true || !p1 || !p2 || !apogeo || !datos || !Array.isArray(perfil) || perfil.length < 2 ||
      ![p1, p2, apogeo].every(geographic) ||
      ![p1.elevacion_msnm, p2.elevacion_msnm, apogeo.altitud_visual_msnm, datos.apogeo_visual_m].every(Number.isFinite) ||
      perfil.some(point => !point || !geographic(point) || !Number.isFinite(point.terreno_msnm) ||
        !Number.isFinite(point.factor) || point.factor < 0 || point.factor > 1)) return [];
  const samples = [...perfil].sort((a, b) => a.factor - b.factor);
  const interior = samples.filter(point => point.factor > 0 && point.factor < 1);
  const anchors = [
    { factor: 0, latitud: p1.latitud, longitud: p1.longitud },
    ...interior.filter(point => point.factor !== 0.5),
    { factor: 0.5, latitud: apogeo.latitud, longitud: apogeo.longitud },
    { factor: 1, latitud: p2.latitud, longitud: p2.longitud },
  ].sort((a, b) => a.factor - b.factor);
  const factors = [...new Set([...Array.from({ length: 121 }, (_, i) => i / 120), ...interior.map(p => p.factor)])].sort((a, b) => a - b);
  // Visual parabola anchored to the absolute apogee returned by the backend.
  const rise = apogeo.altitud_visual_msnm - (p1.elevacion_msnm + p2.elevacion_msnm) / 2;
  return factors.map(t => {
    if (t === 0) return [p1.longitud, p1.latitud, p1.elevacion_msnm];
    if (t === 1) return [p2.longitud, p2.latitud, p2.elevacion_msnm];
    if (t === 0.5) return [apogeo.longitud, apogeo.latitud, apogeo.altitud_visual_msnm];
    const rightIndex = anchors.findIndex(point => point.factor >= t);
    const right = anchors[rightIndex];
    const left = anchors[rightIndex - 1];
    const fraction = (t - left.factor) / (right.factor - left.factor);
    const lon = left.longitud + (right.longitud - left.longitud) * fraction;
    const lat = left.latitud + (right.latitud - left.latitud) * fraction;
    const base = p1.elevacion_msnm + (p2.elevacion_msnm - p1.elevacion_msnm) * t;
    return [lon, lat, base + rise * 4 * t * (1 - t)];
  });
}
