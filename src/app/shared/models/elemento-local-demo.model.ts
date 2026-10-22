/** Cartesian coordinates with an explicitly defined local reference and units. */
export interface ElementoLocalDemo {
  readonly id: string;
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly icon: string;
  readonly iconUrl?: string;
  readonly color: string;
  readonly latitud?: number;
  readonly longitud?: number;
  readonly projectedX?: number;
  readonly projectedY?: number;
}
