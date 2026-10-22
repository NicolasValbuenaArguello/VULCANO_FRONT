/** Arbitrary Cartesian demo units, with no geographic meaning. */
export interface PointInput {
  name: string;
  x: number;
  y: number;
  description: string;
}

export interface PointRecord extends PointInput {
  id: string;
  created_at: string;
}
