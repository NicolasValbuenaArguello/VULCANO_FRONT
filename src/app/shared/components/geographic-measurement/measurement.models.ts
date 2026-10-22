import { GeographicPoint } from '../map-context-menu/map-actions.service';

export type MeasurementTool = 'distance' | 'angle' | 'elevation' | 'route' | 'profile';
export interface TerrainHeight {
  metres: number | null;
  source: string;
  verticalDatum: string;
}
export interface TerrainSample extends GeographicPoint, TerrainHeight { distance: number; }
export interface GeographicMeasurement {
  id: string;
  tool: MeasurementTool;
  points: GeographicPoint[];
  horizontal: number;
  segments: number[];
  angle: number | null;
  loading: boolean;
  samples: TerrainSample[];
  spatial: number | null;
  relief: number | null;
  message: string;
  minimum: number | null;
  maximum: number | null;
  heightDifference: number | null;
  chart: string;
}
export interface CursorCoordinates {
  point: GeographicPoint;
  projected: { x: number; y: number } | null;
  elevation: TerrainHeight | null;
  loading: boolean;
}
