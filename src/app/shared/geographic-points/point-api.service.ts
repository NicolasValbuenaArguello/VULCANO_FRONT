import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { GeographicRecord } from './geographic-points';

/** Campos editables del router FastAPI; UUID y fechas son exclusivamente de salida. */
export type PointInput = Omit<GeographicRecord, 'id' | 'fecha_creacion' | 'fecha_actualizacion'>;
export function pointPayload(p: PointInput): PointInput {
  return { nombre: p.nombre.trim(), observaciones: (p.observaciones || '').trim(), latitud: p.latitud, longitud: p.longitud,
    radio: p.radio, relleno: p.relleno, opacidad: p.opacidad, linea: p.linea,
    grosor: p.grosor, marcador: p.marcador, tamano: p.tamano };
}

/** Valida respuestas antes de publicarlas; no interpreta un error o DTO incompleto como lista vacia. */
export function parseRemotePoint(value: unknown): GeographicRecord {
  const p = value as Record<string, unknown> | null;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!p || typeof p['id'] !== 'string' || !uuid.test(p['id']) || typeof p['nombre'] !== 'string' ||
    !p['nombre'].trim() || p['nombre'].trim().length > 100 ||
    !(p['observaciones'] === null || typeof p['observaciones'] === 'string') ||
    (typeof p['observaciones'] === 'string' && p['observaciones'].length > 2000) ||
    p['sistema_referencia'] !== 'WGS84' ||
    !['latitud', 'longitud', 'radio', 'opacidad', 'grosor', 'tamano'].every(k => typeof p[k] === 'number' && Number.isFinite(p[k])) ||
    Math.abs(p['latitud'] as number) > 90 || Math.abs(p['longitud'] as number) > 180 || (p['radio'] as number) < 0 ||
    (p['opacidad'] as number) < 0 || (p['opacidad'] as number) > 1 || (p['grosor'] as number) <= 0 || (p['tamano'] as number) <= 0 ||
    !['relleno', 'linea', 'marcador'].every(k => typeof p[k] === 'string' && /^#[0-9a-f]{6}$/i.test(p[k] as string)) ||
    !['fecha_creacion', 'fecha_actualizacion'].every(k => typeof p[k] === 'string' && Number.isFinite(Date.parse(p[k] as string))))
    throw new Error('El servidor devolvió un registro de puntos inválido.');
  return { ...pointPayload(p as unknown as PointInput), id: p['id'], fecha_creacion: p['fecha_creacion'] as string,
    fecha_actualizacion: p['fecha_actualizacion'] as string };
}

/** Transporte REST sin estado duplicado ni tokens manuales. Todos los metodos usan los interceptores existentes. */
@Injectable({ providedIn: 'root' })
export class PointApiService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.puntosGeograficosUrl;
  private url(id: string): string { return `${this.base}/${encodeURIComponent(id)}`; }
  private record(response: unknown): GeographicRecord {
    const r = response as { ok?: unknown; registro?: unknown };
    if (!r || r.ok !== true) throw new Error('Respuesta de puntos inválida.');
    return parseRemotePoint(r.registro);
  }
  listar() { return this.http.get<unknown>(this.base).pipe(timeout(environment.timeout), map(response => {
    const r = response as { ok?: unknown; total?: unknown; registros?: unknown[] };
    if (!r || r.ok !== true || !Array.isArray(r.registros) || r.total !== r.registros.length) throw new Error('Listado de puntos inválido.');
    const points = r.registros.map(parseRemotePoint);
    if (new Set(points.map(p => p.id.toLowerCase())).size !== points.length) throw new Error('Listado con UUID duplicados.');
    return points;
  })); }
  consultar(id: string) { return this.http.get<unknown>(this.url(id)).pipe(timeout(environment.timeout), map(r => this.record(r))); }
  crear(p: PointInput) { return this.http.post<unknown>(this.base, pointPayload(p)).pipe(timeout(environment.timeout), map(r => this.record(r))); }
  actualizar(id: string, p: PointInput) { return this.http.put<unknown>(this.url(id), pointPayload(p)).pipe(timeout(environment.timeout), map(r => {
    const point = this.record(r); if (point.id !== id) throw new Error('El servidor cambió el UUID del punto.'); return point;
  })); }
  eliminar(id: string) { return this.http.delete<unknown>(this.url(id)).pipe(timeout(environment.timeout), map(r => {
    const point = this.record(r); if (point.id !== id) throw new Error('Confirmación de eliminación inválida.'); return point;
  })); }
}
