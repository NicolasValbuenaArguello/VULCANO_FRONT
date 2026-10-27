// shared-environment.ts

export const sharedEnvironment = {
  useMockAuth: false,
  timeout: 30000,

  // ============================================================
  // APIs
  // ============================================================

  api: {
    auth: '/api/auth',
    vulcano: '/api/vulcano',

    // Otros servicios: no modificar
    usuarios: 'http://localhost:8001',
    archivos: 'http://localhost:9000',
    operaciones: 'http://localhost:8002',
  },

  // ============================================================
  // ENDPOINTS
  // ============================================================

  endpoints: {

    // ----------------------------------------------------------
    // AUTENTICACIÓN
    // ----------------------------------------------------------

    login: '/token',
    logout: '/logout',
    refreshToken: '/refresh',

    // ----------------------------------------------------------
    // COORDENADAS
    // ----------------------------------------------------------

    coordenadasRegistrar: '/api/coordenadas/registrar',
    coordenadasRegistros: '/api/coordenadas/registros',

    simularTrayectoria: '/api/coordenadas/simular-trayectoria',
    generarInforme: '/api/coordenadas/generar-informe-pdf',

    // ----------------------------------------------------------
    // DEMOSTRACIÓN
    // ----------------------------------------------------------

    demoRegistrar: '/api/demo-points',
    demoListar: '/api/demo-points',

    // ----------------------------------------------------------
    // DEM / ELEVACIÓN
    // ----------------------------------------------------------

    demHealth: '/dem/health',
    demInfo: '/dem/info',
    demElevation: '/dem/elevacion',

    demTiles: '/dem/tiles/{z}/{x}/{y}.png',
    demTileJson: '/dem/tilejson.json',

    // ----------------------------------------------------------
    // CURVAS DE NIVEL
    // ----------------------------------------------------------

    curvasHealth: '/api/curvas/health',
    curvasInfo: '/api/curvas/info',
    curvasBBox: '/api/curvas/bbox',
  },

  // ============================================================
  // MAPA
  // ============================================================

  map: {

    // Configuración inicial
    center: [4.5709, -74.2973],
    zoom: 6,
    minZoom: 3,
    maxZoom: 19,

    // ----------------------------------------------------------
    // OPENSTREETMAP
    // ----------------------------------------------------------

    tileUrl:
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',

    attribution:
      '© OpenStreetMap contributors',

    // ----------------------------------------------------------
    // CAPAS BASE
    // ----------------------------------------------------------

    satellite:
      'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',

    topographic:
      'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',

    light:
      'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png',

    dark:
      'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',

    // ----------------------------------------------------------
    // DIAGNÓSTICO OSM
    // ----------------------------------------------------------

    osmDiagnostic:
      'https://tile.openstreetmap.org/{z}/{x}/{y}.png',

    osmProbe:
      'https://tile.openstreetmap.org/0/0/0.png',

    // ----------------------------------------------------------
    // TERRENO
    // ----------------------------------------------------------

    terrainTileJson:
      'https://tiles.mapterhorn.com/tilejson.json',
  },
};
