import { GeographicPoint } from '../map-context-menu/map-actions.service';

const RADIUS = 6371000;
const radians = (value: number) => value * Math.PI / 180;

/** Distancia ortodromica sobre esfera media, coherente con el radio usado por la Hoja y Leaflet. */
export function horizontalDistance(a: GeographicPoint, b: GeographicPoint): number {
  const lat = radians(b.latitud - a.latitud);
  const lon = radians(b.longitud - a.longitud);
  const h = Math.sin(lat / 2) ** 2 + Math.cos(radians(a.latitud)) * Math.cos(radians(b.latitud)) * Math.sin(lon / 2) ** 2;
  return 2 * RADIUS * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}

/** Proyeccion azimutal equidistante local centrada en el vertice, en metros. */
function localMetric(point: GeographicPoint, origin: GeographicPoint): { x: number; y: number } {
  const dLon = radians(point.longitud - origin.longitud);
  const lat = radians(point.latitud), lat0 = radians(origin.latitud);
  const bearing = Math.atan2(Math.sin(dLon) * Math.cos(lat), Math.cos(lat0) * Math.sin(lat) - Math.sin(lat0) * Math.cos(lat) * Math.cos(dLon));
  const distance = horizontalDistance(origin, point);
  return { x: distance * Math.sin(bearing), y: distance * Math.cos(bearing) };
}

/** Angulo menor en el plano metrico local del segundo punto; los coincidentes no definen angulo. */
export function geographicAngle(a: GeographicPoint, vertex: GeographicPoint, b: GeographicPoint): number | null {
  if ([a, b].some(point => horizontalDistance(point, vertex) >= Math.PI * RADIUS - 1e-3)) return null;
  const u = localMetric(a, vertex), v = localMetric(b, vertex);
  const length = Math.hypot(u.x, u.y) * Math.hypot(v.x, v.y);
  if (length < 1e-6) return null;
  return Math.acos(Math.max(-1, Math.min(1, (u.x * v.x + u.y * v.y) / length))) * 180 / Math.PI;
}

/** Interpolacion sobre circulo maximo; rechaza la trayectoria ambigua de antipodas exactas. */
export function interpolateGeographic(a: GeographicPoint, b: GeographicPoint, fraction: number): GeographicPoint | null {
  const angle = horizontalDistance(a, b) / RADIUS;
  if (angle < 1e-12) return { ...a };
  if (Math.abs(Math.sin(angle)) < 1e-10) return null;
  const x = Math.sin((1 - fraction) * angle) / Math.sin(angle);
  const y = Math.sin(fraction * angle) / Math.sin(angle);
  const latA = radians(a.latitud), latB = radians(b.latitud), lonA = radians(a.longitud), lonB = radians(b.longitud);
  const vx = x * Math.cos(latA) * Math.cos(lonA) + y * Math.cos(latB) * Math.cos(lonB);
  const vy = x * Math.cos(latA) * Math.sin(lonA) + y * Math.cos(latB) * Math.sin(lonB);
  const vz = x * Math.sin(latA) + y * Math.sin(latB);
  return { latitud: Math.atan2(vz, Math.hypot(vx, vy)) * 180 / Math.PI, longitud: Math.atan2(vy, vx) * 180 / Math.PI };
}

/** Recta espacial entre extremos con cota, mediante coordenadas geocentricas WGS84. */
export function spatialDistance(a: GeographicPoint, altitudeA: number, b: GeographicPoint, altitudeB: number): number {
  const ecef = (p: GeographicPoint, height: number) => {
    const lat = radians(p.latitud), lon = radians(p.longitud), e2 = 0.00669437999014;
    const n = 6378137 / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
    return [(n + height) * Math.cos(lat) * Math.cos(lon), (n + height) * Math.cos(lat) * Math.sin(lon), (n * (1 - e2) + height) * Math.sin(lat)];
  };
  const u = ecef(a, altitudeA), v = ecef(b, altitudeB);
  return Math.hypot(u[0] - v[0], u[1] - v[1], u[2] - v[2]);
}

/** Presentacion de longitudes horizontales y espaciales sin confundir sus unidades. */
export function formatDistance(metres: number): string { return metres < 1000 ? `${metres.toFixed(2)} m` : `${(metres / 1000).toFixed(3)} km`; }

/** Conversion EPSG:9377 compatible con la Hoja existente, limitada al entorno nacional. */
export function nationalCoordinates(longitud: number, latitud: number): { x: number; y: number } | null {
    if (!Number.isFinite(latitud) || !Number.isFinite(longitud) || latitud < -5 || latitud > 14 || longitud < -84 || longitud > -66) return null;
    if (latitud < -90 || latitud > 90 || longitud < -180 || longitud > 180) {
      return null;
    }

    const a = 6_378_137;
    const inverseFlattening = 298.257222101;
    const flattening = 1 / inverseFlattening;
    const eccentricitySquared = flattening * (2 - flattening);
    const secondEccentricitySquared = eccentricitySquared / (1 - eccentricitySquared);
    const scaleFactor = 0.9992;
    const falseEasting = 5_000_000;
    const falseNorthing = 2_000_000;
    const latitudeOfOrigin = 4 * Math.PI / 180;
    const centralMeridian = -73 * Math.PI / 180;
    const latitude = latitud * Math.PI / 180;
    const longitude = longitud * Math.PI / 180;
    const meridionalArc = (angle: number): number => a * (
      (1 - eccentricitySquared / 4 - 3 * eccentricitySquared ** 2 / 64 - 5 * eccentricitySquared ** 3 / 256) * angle
      - (3 * eccentricitySquared / 8 + 3 * eccentricitySquared ** 2 / 32 + 45 * eccentricitySquared ** 3 / 1024) * Math.sin(2 * angle)
      + (15 * eccentricitySquared ** 2 / 256 + 45 * eccentricitySquared ** 3 / 1024) * Math.sin(4 * angle)
      - (35 * eccentricitySquared ** 3 / 3072) * Math.sin(6 * angle)
    );
    const sinLatitude = Math.sin(latitude);
    const cosLatitude = Math.cos(latitude);
    const tangentSquared = Math.tan(latitude) ** 2;
    const radiusOfCurvature = a / Math.sqrt(1 - eccentricitySquared * sinLatitude ** 2);
    const c = secondEccentricitySquared * cosLatitude ** 2;
    const d = cosLatitude * (longitude - centralMeridian);
    const x = falseEasting + scaleFactor * radiusOfCurvature * (
      d + (1 - tangentSquared + c) * d ** 3 / 6 + (5 - 18 * tangentSquared + tangentSquared ** 2 + 72 * c - 58 * secondEccentricitySquared) * d ** 5 / 120
    );
    const y = falseNorthing + scaleFactor * (
      meridionalArc(latitude) - meridionalArc(latitudeOfOrigin)
      + radiusOfCurvature * Math.tan(latitude) * (
        d ** 2 / 2 + (5 - tangentSquared + 9 * c + 4 * c ** 2) * d ** 4 / 24
        + (61 - 58 * tangentSquared + tangentSquared ** 2 + 600 * c - 330 * secondEccentricitySquared) * d ** 6 / 720
      )
    );
    return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
  }
