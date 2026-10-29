import { Injectable, computed, signal } from '@angular/core';
import { GeographicPoint, validGeographicPoint } from '../components/map-context-menu/map-actions.service';

export interface PointStyle {
  radio: number; relleno: string; opacidad: number; linea: string; grosor: number; marcador: string; tamano: number;
}
export interface GeographicRecord extends GeographicPoint, PointStyle {
  id: string; nombre: string; observaciones: string;
  fecha_creacion?: string; fecha_actualizacion?: string;
}
export const DEFAULT_POINT_STYLE: PointStyle = {
  radio: 500, relleno: '#2879eb', opacidad: .2, linea: '#c6a75d', grosor: 2, marcador: '#2879eb', tamano: 6,
};
export interface Dms { hemisferio: string; grados: number; minutos: number; segundos: number; }

/** Descompone DD con acarreo a precision de seis decimales de segundo. No modifica registros. */
export function toDms(value: number, latitude: boolean): Dms {
  const total = Math.round(Math.abs(value) * 3600 * 1e6) / 1e6;
  const grados = Math.floor(total / 3600), minutos = Math.floor((total - grados * 3600) / 60);
  return { hemisferio: latitude ? value < 0 ? 'S' : 'N' : value < 0 ? 'W' : 'E', grados, minutos,
    segundos: Number((total - grados * 3600 - minutos * 60).toFixed(6)) };
}

/** Valida DMS antes de convertir; null nunca se interpreta como cero. */
export function fromDms(dms: Dms, latitude: boolean): number | null {
  const { grados: g, minutos: m, segundos: s } = dms, max = latitude ? 90 : 180;
  if (![g, m, s].every(v => typeof v === 'number' && Number.isFinite(v)) ||
    !Number.isInteger(g) || !Number.isInteger(m) || g < 0 || g > max || m < 0 || m >= 60 || s < 0 || s >= 60 ||
    (g === max && (m !== 0 || s !== 0)) || !(latitude ? ['N', 'S'] : ['W', 'E']).includes(dms.hemisferio)) return null;
  return (g + m / 60 + s / 3600) * (['S', 'W'].includes(dms.hemisferio) ? -1 : 1);
}

/** Anillo aproximado de 96 segmentos sobre esfera media WGS84; radio en metros, no grados. */
export function geographicCircle(point: GeographicPoint, meters: number): GeoJSON.Polygon {
  const rad = Math.PI / 180, lat = point.latitud * rad, lon = point.longitud * rad, distance = meters / 6371000;
  const ring: number[][] = [];
  for (let i = 0; i < 96; i++) {
    const bearing = i * 2 * Math.PI / 96;
    const y = Math.asin(Math.max(-1, Math.min(1, Math.sin(lat) * Math.cos(distance) + Math.cos(lat) * Math.sin(distance) * Math.cos(bearing))));
    const x = lon + Math.atan2(Math.sin(bearing) * Math.sin(distance) * Math.cos(lat), Math.cos(distance) - Math.sin(lat) * Math.sin(y));
    ring.push([x / rad, y / rad]);
  }
  ring.push([...ring[0]]);
  return { type: 'Polygon', coordinates: [ring] };
}

/** Estado general de puntos durante la sesion de la aplicacion. Sin HTTP ni persistencia web. */
@Injectable({ providedIn: 'root' })
export class GeographicPointsService {
  private readonly records = signal<readonly GeographicRecord[]>([]);
  readonly registros = this.records.asReadonly();
  readonly captura = signal(false);
  readonly temporal = signal<GeographicRecord | null>(null);
  readonly seleccion = signal<string | null>(null);
  private readonly plotted = signal<ReadonlySet<string>>(new Set());
  private sequence = 0;

  /** Publica una respuesta remota validada, sin duplicar otra coleccion de negocio. */
  cargarConfirmados(records: readonly GeographicRecord[]): void {
    this.records.set(records.map(p => ({ ...p })));
    this.plotted.set(new Set(records.map(p => p.id)));
    if (!records.some(p => p.id === this.seleccion())) this.seleccion.set(null);
  }

  /** Incorpora el UUID confirmado por el servidor; nunca genera uno local para operaciones HTTP. */
  confirmar(record: GeographicRecord): void {
    this.records.update(items => items.some(p => p.id === record.id) ? items.map(p => p.id === record.id ? { ...record } : p) : [...items, { ...record }]);
    this.seleccion.set(record.id); this.temporal.set(null);
  }

  /** Limpieza local de sesion; no realiza DELETE remoto. */
  limpiarSesion(): void {
    this.records.set([]); this.plotted.set(new Set()); this.seleccion.set(null);
    this.temporal.set(null); this.captura.set(false);
  }

  /** Capas derivadas exclusivamente de puntos confirmados para graficar y del marcador temporal. */
  readonly geometria = computed<GeoJSON.FeatureCollection>(() => {
    const features: GeoJSON.Feature[] = [];
    for (const p of this.records().filter(p => this.plotted().has(p.id))) {
      features.push({ type: 'Feature', id: p.id + '-circle', properties: { ...p }, geometry: geographicCircle(p, p.radio) });
      features.push({ type: 'Feature', id: p.id, properties: { ...p }, geometry: { type: 'Point', coordinates: [p.longitud, p.latitud] } });
    }
    const preview = this.temporal();
    if (preview) features.push({ type: 'Feature', id: 'puntos-preview', properties: { ...preview },
      geometry: { type: 'Point', coordinates: [preview.longitud, preview.latitud] } });
    return { type: 'FeatureCollection', features };
  });

  /** Valida formulario y estilo; devuelve mensaje sin alterar el estado. */
  validar(p: Omit<GeographicRecord, 'id'>): string | null {
    if (!p.nombre.trim() || p.nombre.trim().length > 100) return 'Ingrese un nombre de hasta 100 caracteres.';
    if (p.observaciones.length > 2000) return 'Las observaciones admiten hasta 2000 caracteres.';
    if (!validGeographicPoint(p)) return 'Ingrese coordenadas WGS84 válidas.';
    if (![p.radio, p.opacidad, p.grosor, p.tamano].every(v => typeof v === 'number' && Number.isFinite(v)) ||
      p.radio < 1 || p.radio > 100000 || p.opacidad < 0 || p.opacidad > 1 || p.grosor < 1 || p.grosor > 12 || p.tamano < 3 || p.tamano > 20)
      return 'Revise radio (1–100000 m), opacidad (0–1), grosor (1–12) y marcador (3–20 px).';
    if (![p.relleno, p.linea, p.marcador].every(c => /^#[0-9a-f]{6}$/i.test(c))) return 'Seleccione colores RGB válidos.';
    return null;
  }

  /** Agrega o actualiza solo el ID solicitado. Mantiene sus capas si ya fue graficado. */
  guardar(p: Omit<GeographicRecord, 'id'>, id: string | null = null): GeographicRecord {
    const error = this.validar(p);
    if (error) throw new Error(error);
    if (id && !this.records().some(r => r.id === id)) throw new Error('El punto ya no existe.');
    const record = { ...p, nombre: p.nombre.trim(), id: id ?? `punto-${++this.sequence}` };
    this.records.update(items => id ? items.map(r => r.id === id ? record : r) : [...items, record]);
    this.seleccion.set(record.id); this.temporal.set(null);
    return record;
  }

  /** Captura de un solo clic; consume el gesto sin registrar automaticamente ni alterar otras herramientas. */
  capturar(point: GeographicPoint): boolean {
    if (!this.captura() || !validGeographicPoint(point)) return false;
    this.temporal.set({ ...DEFAULT_POINT_STYLE, ...point, id: 'temporal', nombre: '', observaciones: '' });
    this.captura.set(false);
    return true;
  }

  /** Confirma la representacion del listado, sin duplicar IDs ni realizar HTTP. */
  graficar(): void { this.plotted.set(new Set(this.records().map(p => p.id))); this.temporal.set(null); }

  /** Elimina solo este registro y su representacion. */
  eliminar(id: string): void {
    this.records.update(items => items.filter(p => p.id !== id));
    this.plotted.update(ids => new Set([...ids].filter(item => item !== id)));
    if (this.seleccion() === id) this.seleccion.set(null);
  }
}
