# Baseline MapLibre 6.3.0

Fecha: 2026-08-14

## Objetivo

Usar un baseline aislado de MapLibre 6.3.0 para comparar el control oficial contra el DEM local sin tocar Python, Rasterio ni la logica del backend.

La idea es separar tres capas:

1. Baseline oficial puro con la misma arquitectura del ejemplo de MapLibre.
2. Baseline local con la misma arquitectura, cambiando solo la fuente DEM.
3. Transferir el resultado estable al flujo normal de `mapa-tres-d` solo si el baseline confirma que el terreno funciona.

## Alcance aplicado

Se agrego un baseline independiente en `mapa-tres-d` con:

- contenedor propio `#terrainBaselineContainer`
- mapa propio `baselineMap`
- panel propio de diagnostico
- ejecucion separada del mapa normal
- fuentes `terrainSource` y `hillshadeSource`
- capa `osm`
- capa `hills`
- `terrain`
- `sky: {}`
- `NavigationControl`
- `TerrainControl`

## Archivos modificados

- [src/app/pages/vulcano/mapa-tres-d/mapa-tres-d.ts](D:/2026/VULCANO/vulcano/src/app/pages/vulcano/mapa-tres-d/mapa-tres-d.ts)
- [src/app/pages/vulcano/mapa-tres-d/mapa-tres-d.html](D:/2026/VULCANO/vulcano/src/app/pages/vulcano/mapa-tres-d/mapa-tres-d.html)
- [src/app/pages/vulcano/mapa-tres-d/mapa-tres-d.css](D:/2026/VULCANO/vulcano/src/app/pages/vulcano/mapa-tres-d/mapa-tres-d.css)

## Flujo baseline implementado

### Control oficial

El control oficial hace lo siguiente:

1. valida acceso al TileJSON remoto
2. crea un mapa aislado en el contenedor baseline
3. aplica el style oficial
4. espera el evento `load`
5. espera `terrainSource` y `hillshadeSource`
6. espera `idle`
7. consulta `queryTerrainElevation()`
8. registra el resultado como `BASELINE OFICIAL`

### Control local

El control local repite la misma arquitectura pero cambia solo la fuente DEM a:

`{demApiUrl}/dem/tiles/{z}/{x}/{y}.png`

con:

- `encoding: 'terrarium'`
- `tileSize: 256`
- `maxzoom: 13`
- `bounds: DEM_BOUNDS`

## Lo que ya confirma el build

`npm run build` completo con exito despues de integrar el baseline.

Advertencias que siguen existiendo y no estan relacionadas con este cambio:

- `src/app/pages/login/login.component.css` excede el budget
- `leaflet` sigue entrando como dependencia CommonJS

## Resultado esperado del baseline

### Si oficial PASS y local PASS

El problema ya no estaria en MapLibre ni en el DEM aislado, sino en el flujo normal de `mapa-tres-d`.

### Si oficial PASS y local FAIL

La diferencia estaria en la fuente local, el maxzoom, los bounds o la integracion del endpoint local.

### Si oficial FAIL y local PASS

El problema estaria en la configuracion del control oficial o en la respuesta remota.

### Si ambos FAIL

La causa estaria en el entorno del mapa aislado, la version de MapLibre, WebGL o la configuracion del terrain.

## Siguiente paso operativo

Ejecutar el baseline desde el panel de diagnostico:

1. abrir `mapa-tres-d`
2. pulsar `ABRIR BASELINE`
3. ejecutar `CONTROL OFICIAL`
4. ejecutar `CONTROL LOCAL`
5. copiar el resultado con `COPIAR BASELINE`

## Nota importante

Este reporte documenta la integracion del baseline y la validacion de build.
La evidencia de ejecucion real del navegador aun debe capturarse con el panel baseline para cerrar el diagnostico final.
