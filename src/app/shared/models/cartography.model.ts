/** Identidades estables del selector existente; no dependen del proveedor. */
export type BaseMapId = 'streets' | 'satellite' | 'topographic' | 'light' | 'dark';
export type GeographicBounds = [west: number, south: number, east: number, north: number];

/** Fuente XYZ raster compatible con ambos motores, externa o propia. */
export interface RasterBaseMap {
  enabled: boolean;
  id: BaseMapId;
  name: string;
  provider: string;
  type: 'raster';
  tileUrl: string;
  subdomains?: string[];
  tileSize: number;
  attribution: string;
  minZoom: number;
  maxZoom: number;
  bounds?: GeographicBounds;
  requiresApiKey: boolean;
}

/** Se proporciona al arrancar Angular; cambiar origen no implica fallback automatico. */
export interface CartographyConfig {
  layers: Record<BaseMapId, RasterBaseMap>;
}

/** Contrato propuesto para GET /cartography/v1/catalog (todavia no se consulta). */
export interface CartographyCatalog {
  version: '1';
  coverage: GeographicBounds;
  layers: Array<RasterBaseMap | VectorBaseMap>;
}

/** Reservado para una fase posterior: Leaflet actual no renderiza MVT directamente. */
export interface VectorBaseMap {
  id: BaseMapId;
  name: string;
  provider: string;
  type: 'vector';
  tileJsonUrl: string;
  styleUrl: string;
  attribution: string;
  bounds: GeographicBounds;
  minZoom: number;
  maxZoom: number;
}

/** Metadatos TileJSON propuestos para fuentes XYZ; no contiene datos DEM. */
export interface CartographyTileJson {
  tilejson: '3.0.0';
  name: string;
  tiles: string[];
  scheme: 'xyz';
  minzoom: number;
  maxzoom: number;
  bounds: GeographicBounds;
  attribution: string;
}

/** Contrato propuesto para GET /cartography/v1/health. */
export interface CartographyHealth {
  status: 'ok' | 'degraded';
  datasetVersion: string;
  availableLayers: BaseMapId[];
}
