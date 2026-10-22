# MapaTresD

`MapaTresD` es un componente Angular standalone e independiente para visualizar un globo terráqueo interactivo con **MapLibre GL JS**.

Está pensado para crecer después con terreno 3D, DEM de Colombia, capas operacionales, GeoJSON, objetos 3D y futuras integraciones con backend.

## Qué hace hoy

- Inicializa un globo terrestre en MapLibre.
- Usa una base raster XYZ.
- Permite zoom, rotación, pitch y navegación estándar.
- Incluye `NavigationControl` en `top-right`.
- Incluye `ScaleControl` en `bottom-left`.
- Usa `ResizeObserver` para llamar a `map.resize()` cuando cambia el contenedor.
- Limpia listeners, observador y RAF pendientes en `OnDestroy`.

## Uso

```html
<app-mapa-tres-d></app-mapa-tres-d>
```

## Diferencia entre Leaflet y MapLibre

- Leaflet usa coordenadas como `[latitud, longitud]`.
- MapLibre usa coordenadas como `[longitud, latitud]`.

Ejemplo de Colombia en MapLibre:

```ts
[-74.2973, 4.5709]
```

## Inputs

- `center`: centro inicial del globo. Orden MapLibre: `[longitud, latitud]`.
- `zoom`: zoom inicial.
- `minZoom`: zoom mínimo.
- `maxZoom`: zoom máximo.
- `maxPitch`: pitch máximo permitido.

## Outputs

- `mapReady`: emite la instancia de `MapLibreMap` cuando el mapa termina de cargar.

## API pública

### `flyTo(longitude, latitude, zoom = 10)`

Mueve la cámara del globo a una coordenada específica.

### `resetGlobeView()`

Vuelve a una vista inicial aproximada de América / Colombia.

### `changeBaseMap(baseMapId)`

Permite cambiar el mapa base sin recrear el componente Angular.

Internamente, `MapaTresD` elimina solo la fuente y la capa base activas, y luego
crea la nueva fuente raster y su capa correspondiente.

## Control de mapas base

El selector aparece como un control nativo de MapLibre en la esquina superior derecha.

Incluye estas opciones:

- `Calles`
- `Satelital`
- `Topográfico`
- `Claro`
- `Oscuro`

Solo una puede estar activa a la vez.

El control no recrea el mapa, no cambia la URL y conserva:

- centro
- zoom
- bearing
- pitch
- proyección `globe`

## Diagnóstico si el radio cambia pero el mapa no

Revisa este flujo en consola y red:

1. `BaseMapControl` debe emitir el cambio.
2. `changeBaseMap(baseMapId)` debe ejecutarse.
3. `BASE_SOURCE_ID` y `BASE_LAYER_ID` deben ser los mismos al quitar y agregar.
4. Verifica en `Network` que los tiles vayan al proveedor correcto.
5. Si aparecen `401`, `403`, `404` o `CORS`, el proveedor de tiles está rechazando la solicitud.

## Cómo agregar otro mapa base

Agrega una nueva entrada en `baseMaps` con una estructura similar a esta:

```ts
{
  id: 'institucional',
  name: 'Cartografía institucional',
  tiles: ['http://SERVIDOR_INTERNO/tiles/{z}/{x}/{y}.png'],
  tileSize: 256,
  attribution: 'Cartografía institucional',
  minZoom: 0,
  maxZoom: 18,
}
```

Después puedes exponerla en el control sin cambiar la lógica principal de
MapLibre.

## Mapas base

La configuración base está centralizada dentro del componente en `BASE_MAPS`.

Actualmente quedan preparados:

- `Calles`
- `Satelital`
- `Topográfico`
- `Claro`
- `Oscuro`

El mapa inicia con `Calles`.

## Satelital

La capa satelital actual usa Esri World Imagery con atribución correspondiente.

Si en el futuro necesitas otro proveedor, centraliza el cambio en `baseMaps`
o en `environment` si requiere token o configuración externa.

No uses proveedores no autorizados ni URLs internas de Google sin licencia válida.

## Tiles propios

La arquitectura está preparada para agregar después una entrada como:

```ts
{
  id: 'institucional',
  name: 'Cartografía institucional',
  type: 'raster',
  tiles: ['http://SERVIDOR/{z}/{x}/{y}.png'],
  tileSize: 256,
  attribution: 'Cartografía institucional'
}
```

## DEM y terreno 3D

No se implementa todavía, pero la ruta futura será:

1. DEM Colombia
2. Servidor de terreno
3. Raster-DEM tiles
4. `map.setTerrain(...)`

MapLibre puede usar fuentes `raster-dem` para habilitar terreno 3D y hillshade.

## Diferencia entre mapa base y DEM

- Mapa base: cartografía, satélite, calles, relieve visual.
- DEM: elevación del terreno.

Son conceptos distintos. El mapa base puede cambiarse ahora sin tocar DEM.

### Terrarium

Terrarium es un formato común para codificar elevación en mosaicos raster.

## Three.js

Three.js no se usa hoy para construir el planeta.

Más adelante puede integrarse mediante `MapLibre CustomLayerInterface` para:

- modelos GLB
- objetos 3D
- marcadores 3D
- animaciones

## ResizeObserver

El componente observa su contenedor y llama a `map.resize()` sin destruir ni recrear el mapa.

Si el panel padre cambia de tamaño, el mapa se adapta automáticamente.

## `mapReady`

Se emite cuando termina la carga inicial.

Ejemplo:

```html
<app-mapa-tres-d (mapReady)="onMapReady($event)"></app-mapa-tres-d>
```

## Diagnóstico de pantalla negra

Si ves una pantalla negra:

- verifica que MapLibre CSS esté cargado
- revisa si WebGL está disponible
- confirma que el contenedor tenga ancho y alto reales
- revisa errores de tiles en consola

## Diagnóstico de tiles que no cargan

Si no ves mapas:

- revisa la URL del tile
- revisa la atribución
- revisa la consola de red
- confirma que el proveedor permita uso desde navegador

## Diagnóstico de WebGL

Si el navegador no soporta WebGL, el componente muestra un mensaje de error dentro del propio contenedor y escribe el detalle en consola.



## Diagn�stico de mapas base

Cuando selecciones una opci�n, revisa consola y red:

1. Debe aparecer `Solicitando mapa base` con el id solicitado.
2. Debe aparecer el listado de `Tiles` del proveedor elegido.
3. `MapLibre:` en consola indica errores reales del motor o del proveedor.
4. En `Network`, confirma que los tiles realmente cambien de host y ruta.
5. `401` o `403` suelen indicar credenciales o permisos.
6. `404` indica una URL o tile inexistente.
7. `CORS` indica que el servidor no permite la petici�n desde navegador.
8. Una pantalla negra tambi�n puede venir de orden de capas, opacidad o una fuente que nunca termina de cargar.

`Claro` y `Oscuro` pueden compartir proveedor raster hoy y m�s adelante migrar a estilos vectoriales `styleUrl` sin cambiar el selector.

## Agregar un nuevo proveedor

Agrega una nueva entrada en `baseMaps` con una estructura similar a esta:

```ts
{
  id: 'institucional',
  name: 'Cartograf�a institucional',
  type: 'raster',
  tiles: ['https://SERVIDOR/tiles/{z}/{x}/{y}.png'],
  tileSize: 256,
  attribution: 'Cartograf�a institucional',
  minZoom: 0,
  maxZoom: 18,
  requiresApiKey: false,
}
```

Si m�s adelante el proveedor entrega `style.json`, cambia `type` a `style` y usa `styleUrl` en vez de `tiles`.

No hardcodees API keys dentro del componente; si el proveedor las requiere, con�ctalas desde `environment`.
