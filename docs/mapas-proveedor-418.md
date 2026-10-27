# Teselas y bloqueo OSM (23 de octubre de 2026)

## Diagnostico

El mensaje HTTP 418 «Access blocked» reportado corresponde al servidor de teselas, no a un error de Angular. Sin una captura de red del despliegue afectado ni informacion del operador no se puede atribuir el bloqueo a una IP, cuota o cabecera concreta ni confirmar su levantamiento desde el repositorio.

Se revisaron Leaflet (`shared/components/mapa/mapa.ts`), MapLibre (`pages/vulcano/mapa-tres-d/mapa-tres-d.ts`), la plantilla padre, entornos, interceptores y configuracion nginx.

El inventario incluye ademas `pages/terrain-minimal-test/terrain-minimal-test.ts` (ruta de diagnostico MapLibre), `shared/components/geographic-measurement/measurement-adapters.ts` (adaptadores de medicion sobre mapas existentes), `pages/vulcano/vulcano.ts` (coordinacion de camaras) y `src/main.ts` (worker CSP, dos workers y concurrencia maxima de 24 imagenes). Los adaptadores no construyen mapas ni solicitan teselas base. No se considera la concurrencia por si sola prueba de abuso o causa del bloqueo.

- La capa Calles de ambos motores usa `environment.map.tileUrl`, que ya apuntaba a la URL oficial HTTPS de OSM. Satelital usa Esri; Topografico, OpenTopoMap; Claro/Oscuro, CARTO. Se mantienen estas selecciones y sus atribuciones.
- El diagnostico tenia URLs independientes en `a.tile.openstreetmap.org`. Ahora usa el mismo endpoint oficial. No hay rotacion de dominios ni fallback para evitar un bloqueo.
- Las dos vistas se montaban al inicio, incluso con la vista 3D oculta por CSS. Cada componente protege su inicializacion con `if (this.map)` y elimina su mapa al destruirse. El mapa adicional de diagnostico se destruye antes de recrearlo.
- El diagnostico OSM pasaba por `getResource`, que fuerza `cache: 'no-store'` para diagnosticos. Ahora esa unica sonda usa `fetch(url)` con los valores normales del navegador. No se modifica el servicio DEM ni sus diagnosticos.
- Las solicitudes normales de teselas no usan el HttpClient de Angular ni su interceptor de autenticacion. No se encontraron cache-busters o descargas masivas de OSM en el codigo revisado. No se midio el trafico real.
- No se encontro una politica que elimine Referer en el HTML o nginx del repositorio. Debe verificarse el despliegue real, extensiones, VPN y proxy sin cambiar identidades ni cabeceras para evadir el bloqueo.

## Cambios

1. `src/app/pages/vulcano/vulcano.html`: difiere la primera creacion de MapLibre hasta seleccionar 3D mediante `@defer`. La instancia permanece montada despues de abrirse, conservando estado, camara y capas. Esto evita la carga inicial oculta; no suspende toda actividad de una vista ya creada.
2. `src/app/shared/components/mapa/mapa.ts`: las capas Leaflet esperan al final del desplazamiento/zoom y conservan un buffer de una tesela, reduciendo cargas intermedias.
3. `src/environments/environment.shared.ts`: alinea las URLs de diagnostico con el endpoint OSM oficial, sin sustituir proveedor.
4. `src/app/pages/vulcano/mapa-tres-d/mapa-tres-d.ts`: la sonda OSM conserva la cache HTTP normal del navegador y devuelve el estado bloqueado sin reintentos ni fallback.
5. Tests de `vulcano.spec.ts` y `mapa-tres-d.spec.ts`: cubren creacion diferida, persistencia y sonda bloqueada.
6. `src/app/pages/terrain-minimal-test/terrain-minimal-test.ts`: elimina la URL fija alternativa y comparte `environment.map.tileUrl` y su atribucion. Se agrega tambien atribucion a la fuente OSM del estilo de control de terreno en MapLibre. No cambia los algoritmos ni las fuentes de elevacion.

No se modifican estilos, herramientas, curvas, perfiles, navegacion ni fuentes DEM. No se instalan dependencias.

## Politica y operacion

OSM exige atribucion visible, Referer real para paginas web y respeto de Cache-Control/Expires/ETag. Prohibe descargas masivas y saltarse la cache. Los navegadores con configuracion normal ya implementan su cache HTTP. No se agrega una cache offline ni proxy de OSM. Desactivar la cache en DevTools de forma permanente durante pruebas incrementa las descargas.

El servicio publico no tiene SLA. Corregir la aplicacion no revoca un bloqueo existente: gestionar el caso con el operador siguiendo su politica. No comprobar mediante bucles de peticiones. En una prueba manual, desde la red afectada y con cache habilitada, revisar una carga visible y sus solicitudes/respuestas, URL, estado, Referer real y cabeceras de cache. Verificar que no existe mapa 3D antes de seleccionarlo, que se conserva tras volver a 2D y que siguen funcionando las capas y herramientas. No se realizo esta verificacion en un navegador de la red afectada.

## Alternativas antes de sustituir

No se ha cambiado de proveedor. Un despliegue que requiera disponibilidad garantizada debe evaluar un contrato adecuado o alojamiento propio. Hace falta elegir proveedor, cobertura, uso permitido, trafico previsto y presupuesto antes de migrar.

| Alternativa | Requisitos | Costos publicados o previstos |
| --- | --- | --- |
| OSM publico | Cumplir politica y resolver bloqueo con el operador | Sin SLA; no permite garantizar disponibilidad |
| Thunderforest | Cuenta, clave publica restringida cuando proceda, atribucion, licencia y plan adecuados; comprobar compatibilidad XYZ/CORS/zoom | Hobby: 150.000 solicitudes/mes gratis para pruebas. Solo Developer: USD 125/mes, 1.500.000 solicitudes/mes. Confirmar idoneidad del plan para el uso de VULCANO |
| Servidor propio | Datos OSM obtenidos de extractos autorizados, renderizado, HTTPS/CORS, cache, actualizaciones y operacion | Infraestructura, almacenamiento, transferencia y mantenimiento; presupuesto segun cobertura, zoom y usuarios. No copiar teselas del servidor publico |

Una sustitucion puede cambiar la apariencia de la cartografia; debe revisarse antes para respetar el diseno requerido. La atribucion debe corresponder al proveedor elegido. No debe conectarse silenciosamente a otro servicio ante un 418.

## Validacion

- 42 pruebas aprobadas en seis suites: mapas 2D/3D, padre Vulcano, loader, capas y mediciones.
- `npx ng build`: compila los archivos Angular, pero termina con error por el presupuesto CSS existente de Hoja Milimetrada (19,26 kB frente a 18 kB). No se aumenta el presupuesto ni se modifica ese CSS.
- `npx ng build --configuration development`: completado correctamente.
- No se confirma desbloqueo ni estabilidad del proveedor desde estas pruebas locales.

## Fuentes oficiales

- https://operations.osmfoundation.org/policies/tiles/
- https://www.thunderforest.com/pricing/
- https://www.thunderforest.com/docs/apikeys/
- https://switch2osm.org/serving-tiles/

Precios consultados el 23 de octubre de 2026; sujetos a cambios.
