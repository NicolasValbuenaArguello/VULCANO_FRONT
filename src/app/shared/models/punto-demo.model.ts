/** Fictitious Cartesian units only. This contract has no geographic fields. */
export type CategoriaDemo = 'punto' | 'muestra' | 'referencia';

export interface PuntoDemoInput {
  name: string;
  category: CategoriaDemo;
  x: number;
  y: number;
  description?: string;
}

export interface PuntoDemo extends PuntoDemoInput {
  readonly id: string;
  readonly created_at: string;
}
