
/**
 * VULCANO 3.0
 * Configuración de proxy para desarrollo.
 *
 * En producción, las rutas se configuran en Nginx.
 */

const target = 'http://127.0.0.1:8010';

console.info(
  `[VULCANO proxy] Backend principal -> ${target}`
);

module.exports = {

  // ==========================================
  // COORDENADAS
  // ==========================================
  '/api/coordenadas': {
    target,
    changeOrigin: true,
    secure: false,
  },

  // ==========================================
  // PUNTOS DE DEMOSTRACIÓN
  // ==========================================
  '/api/demo-points': {
    target: 'http://127.0.0.1:8025',
    changeOrigin: true,
  },

  '/api/demo-points/**': {
    target: 'http://127.0.0.1:8025',
    changeOrigin: true,
  },

  // ==========================================
  // AUTENTICACIÓN
  // ==========================================
  '/api/auth/**': {
    target,
    changeOrigin: true,
    pathRewrite: { '^/api/auth': '' },
  },

  // ==========================================
  // VULCANO
  // ==========================================
  '/api/vulcano/**': {
    target,
    changeOrigin: true,
    pathRewrite: { '^/api/vulcano': '' },
  },

  // ==========================================
  // CURVAS DE NIVEL
  // ==========================================
  // Mantener el prefijo /api/curvas.
  // FastAPI recibe la ruta completa.
  '/api/curvas/**': {
    target,
    changeOrigin: true,
    secure: false,
  },

};
