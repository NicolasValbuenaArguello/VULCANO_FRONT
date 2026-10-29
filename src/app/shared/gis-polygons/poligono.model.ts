/** Contrato del servicio GIS independiente. GeoJSON siempre usa [longitud, latitud]. */
export interface VerticeGis {
  latitud: number;
  longitud: number;
}
export interface EstiloPoligono {
  colorRelleno: string;
  colorLinea: string;
  opacidadRelleno: number;
  opacidadLinea: number;
  grosorLinea: number;
}
export interface PoligonoEntrada {
  nombre: string;
  descripcion: string;
  vertices: VerticeGis[];
  geometria: { type: 'Polygon'; coordinates: [number, number][][] };
  srid: 4326;
  estilo: EstiloPoligono;
}
export interface PoligonoRegistro extends PoligonoEntrada {
  id: string;
  fecha_creacion: string;
  fecha_actualizacion: string;
  version: number;
}
