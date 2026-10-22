# MapaComponent

`MapaComponent` es un componente Angular standalone y reutilizable que encapsula toda la lógica de Leaflet.

Está pensado para insertarse en cualquier pantalla o panel de la aplicación sin mezclar Leaflet en el componente padre.

## Qué resuelve

- Inicializa Leaflet de forma segura en `AfterViewInit`.
- Carga un tile layer base configurable.
- Expone eventos de mapa sin romper la encapsulación.
- Reacciona a cambios de tamaño con `ResizeObserver`.
- Llama internamente a `invalidateSize()` cuando el contenedor cambia.
- Limpia mapa y observadores en `OnDestroy`.

## Ubicación

```text
src/app/shared/components/mapa/
```

## Uso básico

```html
<app-mapa></app-mapa>
```

## Uso recomendado en `Vulcano`

```html
<div class="vulcano-map-wrapper">
  <app-mapa [center]="[4.5709, -74.2973]" [zoom]="6"></app-mapa>
</div>
```

`Vulcano` no debe crear instancias de Leaflet ni llamar APIs directas del mapa.

## Inputs

- `center`: centro inicial del mapa. Por defecto apunta a Colombia.
- `zoom`: nivel inicial de zoom.
- `minZoom`: zoom mínimo.
- `maxZoom`: zoom máximo.
- `tileUrl`: URL del proveedor de tiles.
- `attribution`: atribución del proveedor.

## Outputs

- `mapReady`: emite la instancia de `L.Map` cuando Leaflet termina de inicializar.
- `mapClick`: emite `{ lat, lng }` cuando el usuario hace click sobre el mapa.

## Cómo obtener la instancia del mapa

```html
<app-mapa (mapReady)="onMapReady($event)"></app-mapa>
```

```ts
onMapReady(map: import('leaflet').Map): void {
  this.map = map;
}
```

## API pública

### `refreshMapSize()`

Fuerza a Leaflet a recalcular el tamaño del mapa.

Úsalo cuando el contenedor cambie por:

- paneles
- flex
- grid
- sidebar
- ventanas flotantes
- resize de layout

### `setView(center, zoom?)`

Permite recentrar el mapa sin acceder directamente a `L.Map` desde el padre.

### `addMarker(lat, lng, popup?)`

Agrega un marcador y opcionalmente un popup.

## Configuración de tiles

El componente usa por defecto la configuración de `environment.map`.

Puedes cambiarlo de dos formas:

```html
<app-mapa
  tileUrl="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
  attribution="© OpenStreetMap contributors">
</app-mapa>
```

O centralmente en:

- `src/environments/environment.ts`
- `src/environments/environment.production.ts`

## ResizeObserver

El componente observa su propio contenedor y ejecuta internamente:

```ts
this.map?.invalidateSize();
```

Esto evita tener que corregir el mapa desde cada pantalla cuando cambia el layout.

## Iconos por defecto de Leaflet

Se incluyen rutas locales para los iconos por defecto de Leaflet:

- `marker-icon.png`
- `marker-icon-2x.png`
- `marker-shadow.png`

Así los marcadores funcionan sin depender de rutas rotas al empaquetar Angular.

## Integración futura

La arquitectura queda lista para crecer con:

- capas operacionales
- GeoJSON
- WMS / WMTS
- shapefiles procesados
- puntos, rutas y polígonos
- servicios FastAPI

Todo eso debe seguir viviendo dentro del componente mapa o en servicios especializados, no en `Vulcano`.
