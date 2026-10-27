# Preparacion del servidor cartografico VULCANO

Fecha: 23 de octubre de 2026. Alcance: frontend y contrato propuesto, sin backend ni migracion activa.

## Diagnostico e inventario

| Capa | Proveedor actual y URL | Tipo / zoom fuente | Credenciales y estado |
| --- | --- | --- | --- |
| Calles | OSM: `https://tile.openstreetmap.org/{z}/{x}/{y}.png` | Raster PNG XYZ, 256 px, 0-19 | Sin clave; 418 reportado por el usuario. El motivo exacto del bloqueo no esta confirmado |
| Satelital | Esri World Imagery: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}` | Raster XYZ con orden de ruta z/y/x, 256 px, 0-19 configurado | No se envia clave/token en esta URL legacy. No hay bloqueo reportado/verificado. Esto no acredita licencia o disponibilidad garantizada; revisar contrato Esri antes del despliegue |
| Topografico | OpenTopoMap: `https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png` | Raster PNG XYZ, 256 px, 0-17 | No hay clave configurada. No se verifico disponibilidad real ni se afirma SLA |
| Claro | CARTO Light: `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png` | Raster PNG XYZ, 256 px, 0-20 | Requiere clave utilizable segun CARTO; la URL configurada no la incluye |
| Oscuro | CARTO Dark: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png` | Raster PNG XYZ, 256 px, 0-20 | Mismo requisito; aviso API KEY REQUIRED reportado en una capa CARTO, no se identifica cual mediante una captura |

`{s}` representa los subdominios a/b/c ya utilizados por las bibliotecas. No se rotan para evitar restricciones. Aunque el proveedor use OSM como datos de origen, CARTO y OpenTopoMap operan servicios distintos del servidor publico OSM.

Las cinco capas son raster en ambos motores. Usar MapLibre no las convierte en vectoriales. `raster-dem` corresponde a elevacion y esta fuera de esta integracion; las curvas GeoJSON y las capas de herramientas tampoco son capas base.

El aviso CARTO es una imagen de error producida por el proveedor cuando falta una clave utilizable: un HTTP 200 y una imagen decodificable no prueban que haya cartografia real. CARTO documenta que desde el 25 de septiembre de 2026 no sirve sus raster sin clave. La optimizacion de peticiones no subsana esa autorizacion. No se ha inventado una clave ni se han cambiado URLs CARTO a otro producto.

OSM publico no tiene SLA. Las medidas anteriores reducen carga inicial de MapLibre y cargas intermedias Leaflet, alinean diagnosticos y respetan cache normal; no levantan un bloqueo decidido por el proveedor. No se realizaron sondeos masivos ni comprobaciones de teselas en esta tarea.

## Componentes y servicios involucrados

- `src/environments/environment.shared.ts`: URLs externas y parametros iniciales, compartidos por desarrollo/produccion.
- `src/app/shared/components/mapa/mapa.ts`: Leaflet, selector de cinco capas; preserva los inputs de URL y atribucion de Calles.
- `src/app/pages/vulcano/mapa-tres-d/mapa-tres-d.ts`: MapLibre, selector y transicion de capas sin reconstruir herramientas ni terreno.
- `src/app/pages/vulcano/vulcano.ts` y `.html`: coordinacion de vistas y camaras, primera carga diferida de 3D. No se modificaron en esta fase.
- `src/app/pages/terrain-minimal-test/terrain-minimal-test.ts`: diagnostico de terreno con base raster. Sus URLs siguen el entorno y no activan el nuevo perfil de capas principales automaticamente.
- `src/app/shared/components/geographic-measurement/measurement-adapters.ts`: consume mapas existentes; no crea proveedores ni descarga teselas base.
- `src/main.ts`: worker CSP y concurrencia MapLibre; no es una fuente de cartografia.
- `src/app/core/services/vulcano-api.service.ts`: elevacion/DEM y diagnosticos; no es el futuro servidor de mapas base y no se modifica.

Los diagnosticos auxiliares MapLibre conservan su configuracion del entorno; el nuevo servicio gobierna las cinco capas principales de ambos motores. Un futuro despliegue aislado debera alinear tambien esos diagnosticos y sus dependencias externas de terreno; no se afirma funcionamiento completamente offline.

## Cambios implementados

1. `src/app/shared/models/cartography.model.ts`: contratos `RasterBaseMap`, `VectorBaseMap`, `CartographyConfig`, `CartographyCatalog`, `CartographyTileJson` y `CartographyHealth`.
2. `src/app/shared/services/cartography-config.service.ts`: catalogo compartido de las cinco capas, token `CARTOGRAPHY_CONFIG` para seleccion por despliegue y adaptacion de subdominios para MapLibre. `requiresApiKey` es metadato, no una comprobacion de credenciales.
3. `mapa.ts`: construye las mismas selecciones desde el servicio, convierte limites oeste/sur/este/norte a bounds Leaflet y transmite tamano/zoom. Conserva el override publico de Calles.
4. `mapa-tres-d.ts`: reemplaza el catalogo duplicado por el servicio y transmite bounds a la fuente raster. Conserva controles, transiciones y capas de datos.
5. `cartography-config.service.spec.ts`: prueba las cinco capas externas y una seleccion explicita de Calles propia para ambos motores, conservando las otras cuatro.

No hay nuevos paquetes, llamadas HTTP de configuracion, sondeos de disponibilidad, cambio automatico ante errores ni backend Python. La configuracion se selecciona al arrancar Angular; no se implementa cambio de proveedor en caliente. Los comentarios TypeScript describen las nuevas funciones.

## Arquitectura propuesta

```text
Configuracion del despliegue (externos autorizados / capas propias)
                 |
         CARTOGRAPHY_CONFIG
                 |
      CartographyConfigService
           /               \
      Leaflet            MapLibre
           \               /
       HTTPS /cartography/v1/tiles/...   (futuro)
                 |
          proxy inverso / cache
                 |
         Python + FastAPI
                 |
    datos propios/autorizados de Colombia
```

Fase inicial propuesta: raster PNG XYZ de 256 px en EPSG:3857 para usar ambos motores sin dependencias nuevas. Coordenadas y bounds del catalogo son longitudes/latitudes EPSG:4326, siempre oeste/sur/este/norte. No usar TMS sin convertir y. Limitar zoom al material realmente disponible.

Calles, Claro y Oscuro pueden ser estilos distintos sobre datos vectoriales propios renderizados en el servidor. Topografico requiere datos y un estilo de relieve autorizado; no sustituye curvas ni perfiles actuales. Satelital requiere imagenes y derechos de redistribucion especificos: OSM no proporciona imagenes satelitales. Mantener cada capa externa hasta que su equivalente propio este validado y autorizado; no apuntar las cinco a un archivo inexistente o a una copia de OSM publico.

Cobertura: precisar Colombia continental, islas, limites y zoom por conjunto de datos. Un bounding box solo recorta aproximadamente; el servidor debera aplicar la cobertura real. No se ha descargado un dataset ni certificado cobertura. Presupuestar almacenamiento segun area, zoom, formatos y actualizaciones, no solo numero de usuarios.

### Contrato FastAPI propuesto (no implementado)

| Metodo / ruta | Respuesta y comportamiento esperado |
| --- | --- |
| GET `/cartography/v1/health` | `CartographyHealth`; estado y version del dataset; sin consultar proveedores externos |
| GET `/cartography/v1/catalog` | `CartographyCatalog`; cobertura, atribuciones, capas disponibles y metadatos |
| GET `/cartography/v1/layers/{layer}/tilejson.json` | `CartographyTileJson`, `scheme: xyz`, URLs coherentes con origen LAN/internet |
| GET `/cartography/v1/tiles/{layer}/{z}/{x}/{y}.png` | PNG valido; 404 para fuera de cobertura o tesela ausente, 400 para coordenadas invalidas, 503 para dataset no disponible |
| Futuro: `/cartography/v1/tiles/{layer}/{z}/{x}/{y}.pbf` y estilos | Solo tras definir esquema MVT, sprites, glyphs y renderer. `VectorBaseMap` es un contrato reservado; no puede activarse en el servicio raster actual |

Respuestas de teselas: Content-Type correcto, ETag/Last-Modified, Cache-Control segun version/actualizacion y soporte 304. No devolver avisos como PNG con estado 200. Definir JSON de errores, limites de concurrencia, logs y metricas. La cache del servidor almacena datos propios/autorizados; no es un proxy para eludir el bloqueo OSM.

Internet y LAN deben exponer rutas equivalentes mediante HTTPS y DNS interno/publico, preferiblemente mismo origen con `/cartography`. No incrustar `localhost` (apuntaria al computador del usuario) ni IP privada en el perfil publico. Si es otro origen, configurar CORS explicito para los dominios permitidos; revisar capturas/exportaciones que requieren imagenes sin contaminar canvas. TLS del frontend exige TLS del servicio para evitar mixed content.

Autenticacion: definirla antes del backend. Las URLs de Leaflet se cargan como imagenes y no usan el interceptor Angular: preferir mismo origen con sesion autorizada o URLs firmadas de corta duracion segun requisitos. No incluir secretos de servidor en Angular; las claves de proveedores web son visibles y deben restringirse a origen/cuota cuando el proveedor lo permita. Este contrato no habilita acceso por si solo.

### Activacion futura, explicita y por capa

Ejemplo de preparacion para `app.config.ts` tras tener servidor, cobertura y licencia verificados (NO aplicado):

```typescript
import { CARTOGRAPHY_CONFIG, externalCartographyConfig } from './shared/services/cartography-config.service';

const cartography = externalCartographyConfig();
cartography.layers.streets = {
  ...cartography.layers.streets,
  provider: 'VULCANO Colombia',
  tileUrl: '/cartography/v1/tiles/streets/{z}/{x}/{y}.png',
  attribution: 'Atribucion verificada de los datos utilizados',
  maxZoom: 16, // sustituir por zoom real del dataset
  requiresApiKey: false, // ajustar al esquema de autenticacion acordado
};
// Agregar a appConfig.providers:
// { provide: CARTOGRAPHY_CONFIG, useValue: cartography }
```

Las cuatro capas restantes mantienen su configuracion. Para un externo autorizado, configurar URL documentada con clave de cliente autorizada y atribucion; no activar automaticamente ante un 418/403. El catalogo FastAPI sera una fuente futura de configuracion: hace falta validar su JSON en tiempo de ejecucion, pues las interfaces TypeScript no validan respuestas de red. No hay peticion al catalogo en esta fase.

## Validacion y limites

- 20 pruebas aprobadas: configuracion, mapas 2D/3D y controles de capas, incluida integracion de URL y bounds propios simulados para ambos motores.
- `npx ng build`: sin errores TypeScript/Angular de esta integracion; falla el presupuesto CSS existente de Hoja Milimetrada (19,26 kB frente al limite de 18 kB). No se modifica la Hoja ni su presupuesto.
- `npx ng build --configuration development`: completado correctamente.
- Pendiente: verificar imagenes reales, atribucion, cobertura Colombia, cache, CORS, zoom, exportacion y conectividad desde internet/LAN cuando exista el servidor. No se consideran resueltos OSM 418 ni el aviso CARTO.

## Referencias oficiales

- OSM: https://operations.osmfoundation.org/policies/tiles/
- CARTO (requisito de clave, raster y aviso): https://docs.carto.com/faqs/carto-basemaps
- OpenTopoMap: https://opentopomap.org/about (la consulta automatica fallo por decodificacion; condiciones y disponibilidad requieren revision adicional)
- Esri, servicios autenticados actuales: https://developers.arcgis.com/documentation/security-and-authentication/ (no implica que el endpoint legacy configurado sea el mismo producto)

No se han comprado licencias ni solicitado claves. Los precios y condiciones deben confirmarse con cada operador para el uso institucional de VULCANO.
