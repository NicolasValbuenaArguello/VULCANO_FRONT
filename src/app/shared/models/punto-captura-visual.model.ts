import type { GeographicPoint } from '../components/map-context-menu/map-actions.service';

/** Historial local de demostracion; no representa un registro operativo. */
export interface PuntoCapturaVisual extends GeographicPoint {
  id: number;
}
