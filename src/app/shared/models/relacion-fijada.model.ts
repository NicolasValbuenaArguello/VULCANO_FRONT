export interface PuntoRelacionado {
  readonly id: string;
  readonly latitud: number;
  readonly longitud: number;
  readonly x: number;
  readonly y: number;
}

export interface RelacionFijada {
  readonly origenId: string;
  readonly destinoId: string;
  readonly origen: PuntoRelacionado;
  readonly destino: PuntoRelacionado;
  readonly distanciaMetros: number;
  readonly azimutGrados: number;
}
