# Diagnostico tecnico: DEM 3D en Angular

Fecha: 2026-08-14

## Estado

El backend DEM local se toma como validado por la evidencia del usuario.
Esta prueba se centra solo en `mapa-tres-d` y `vulcano`.

## Objetivo

Determinar si MapLibre 6.3.0 puede renderizar terrain correctamente en esta instancia, primero con un control oficial y luego con el DEM local aislado.

La evidencia ya descarta el backend, Rasterio, Terrarium y la decodificacion PNG en el navegador.
La sospecha principal queda en la sincronizacion del harness con `setStyle()` y `style.load`.

## Archivos tocados

- [src/app/pages/vulcano/mapa-tres-d/mapa-tres-d.ts](D:/2026/VULCANO/vulcano/src/app/pages/vulcano/mapa-tres-d/mapa-tres-d.ts)
- [src/app/pages/vulcano/mapa-tres-d/mapa-tres-d.html](D:/2026/VULCANO/vulcano/src/app/pages/vulcano/mapa-tres-d/mapa-tres-d.html)

## Harness agregado

- `terrainDiagnosticMode`
- `probarTerrainOficial()`
- `probarTerrainStyleCompleto()`
- `probarDemLocalAislado()`
- `probarDecodificacionTileDem()`

## Bloqueos durante diagnostico

Cuando `terrainDiagnosticMode = true`:

- no se ejecuta `configurarDem()` automatico;
- no cambia el mapa base;
- no se aplica `ngOnChanges()` sobre la camara;
- no se activa `activarVista3D()` automatico;
- no se modifica terrain desde otros flujos del componente.

## Referencia oficial

- https://maplibre.org/maplibre-gl-js/docs/examples/3d-terrain/
- https://maplibre.org/maplibre-gl-js/docs/API/classes/RasterDEMTileSource/
- https://maplibre.org/maplibre-style-spec/sources/

## Matriz de diagnostico

| Prueba | Resultado | Evidencia | Conclusion |
|---|---|---|---|
| Canvas size | PASS | containerClientWidth=1098, containerClientHeight=487, canvasWidth=2196, canvasHeight=974, devicePixelRatio=2 | El tamano no es la causa |
| Backend DEM | PASS | ALL DEM CHECKS PASSED | Backend validado |
| Python Terrarium | PASS | difference = -0.000488 | Decodificacion backend valida |
| Control terrain dynamic | PENDING | `probarTerrainOficial()` | Por ejecutar |
| Control terrain style | FAIL | `Style is not done loading` durante `setProjection()` | Harness desincronizado |
| Control elevation | PENDING | `queryTerrainElevation()` en control | Por ejecutar |
| Local PNG browser | PASS | status=200; contentType=image/png; blobSize=160484; width=256; height=256; alphaMin=255; alphaMax=255 | El PNG llega bien al navegador |
| Local PNG min | PASS | minElevation=121.12109375 | Coincide con lo esperado |
| Local PNG max | PASS | maxElevation=5080.921875 | Coincide con lo esperado |
| Local PNG mean | PASS | meanElevation=2040.718431711197 | Coincide con lo esperado |
| Local terrain | PENDING | `probarDemLocalAislado()` | Por ejecutar |
| Local elevation | PENDING | `queryTerrainElevation()` local | Por ejecutar |
| Visual terrain | PENDING | relieve visible o no | Por ejecutar |

## Nueva evidencia

El auto-diagnostico ya inicia correctamente y confirma `PNG LOCAL BROWSER = PASS`.
La ejecucion quedaba estancada en `Probando DEM oficial...` mientras la consola mostraba un ciclo continuo de `resize`.

Eso apunta a dos problemas concretos:

- `map.resize()` estaba siendo disparado de forma repetitiva por el observador de tamaño;
- la prueba DEM oficial dependia de esperas demasiado estrictas para `sourceLoaded` / `idle`.

## Causa raiz

La causa raiz mas probable ya no esta en el DEM ni en el PNG.
La evidencia apunta al harness de MapLibre y al flujo de redimensionamiento: el test de `STYLE OFICIAL COMPLETO` estaba ejecutando `setProjection()` mientras el style todavia no habia terminado de cargar, y el ciclo de `resize` estaba retroalimentando la carga.

El siguiente paso correcto es repetir la prueba despues de sincronizar `style.load` y evitar cualquier operacion sobre el style antes de que MapLibre termine de reconstruirlo.

## Build

`npm run build` paso correctamente despues de corregir la sincronizacion del harness.

Advertencias existentes:

- `src/app/pages/login/login.component.css` excede el budget
- `leaflet` sigue apareciendo como CommonJS

## Siguiente secuencia de prueba

1. Ejecutar `probarTerrainOficial()`.
2. Ejecutar `probarTerrainStyleCompleto()` con la espera de `style.load` ya corregida.
3. Si el control funciona, ejecutar `probarDemLocalAislado()`.
4. Si el local falla, revisar `queryTerrainElevation()` y el estado de `terrain`.

## Lectura esperada

- Control PASS + local FAIL = problema de interpretacion o flujo local.
- Control FAIL + style PASS = problema del flujo dinamico.
- Control FAIL + style FAIL = problema MapLibre/WebGL/configuracion global.
- Control PASS + local PASS = problema del flujo normal o de interferencias.
