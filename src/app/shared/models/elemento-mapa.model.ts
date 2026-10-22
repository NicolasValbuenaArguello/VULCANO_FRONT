export interface CoordenadaDms {
  grados: number;
  minutos: number;
  segundos: number;
}

export interface ElementoMapa {
  idTemporal: string;
  latitud: number;
  longitud: number;
  hemisferioLatitud: 'LN' | 'LS';
  hemisferioLongitud: 'LW' | 'LE';
  coordenadasDms: {
    latitud: CoordenadaDms;
    longitud: CoordenadaDms;
  };
  icono: string | null;
  imagen: string | null;
  configuracion1?: string | null;
  configuracion2?: string | null;
  configuracion3?: string | null;
  archivoIcono?: File | null;
  nombreIcono?: string | null;
  tipoIcono?: string | null;
  archivoImagen?: File | null;
  nombreImagen?: string | null;
  tipoImagen?: string | null;
  fechaCreacion: string;
}
