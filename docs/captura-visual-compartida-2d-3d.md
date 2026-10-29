# Captura visual compartida entre Leaflet y MapLibre

## Estado y flujo

`Vulcano` conserva las propiedades existentes `capturaCoordenadasActiva`,
`coordenadaMapaSeleccionada` y `puntosCapturaVisual`. Ambos mapas reciben la
misma coleccion y sus eventos `mapClick` usan el mismo `onMapClick` del padre.
No hay estados de activacion o historiales independientes en los visores.
Cada visor mantiene unicamente sus objetos de representacion por identificador.

La captura sigue desactivada inicialmente y al abrir o cerrar Limites de
Seguridad. Activar permite continuar P1, P2, P3... en cualquiera de los mapas.
Desactivar, minimizar/restaurar y cambiar de vista conservan los puntos. El
boton de limpieza existente vacia el historial compartido tras confirmacion,
retira sus representaciones en ambos mapas y reinicia la numeracion.

## MapLibre

- Se agrega un unico handler `click` en el `bindMapEvents` existente y se
  retira al destruir el componente. No se registran listeners en cada estilo,
  actualizacion de inputs o cambio de vista.
- Se respeta `defaultPrevented` y `mapActionTarget`, y se usa el mismo criterio
  de superficie y `unproject` ya empleado en el menu contextual para descartar
  cielo, coordenadas no finitas y gestos sobre controles o marcadores.
- El evento entra a Angular mediante `NgZone`; la validacion y normalizacion
  del padre siguen siendo compartidas. No se cambian validadores existentes.
- `puntosCapturaVisual` se representa con marcadores DOM MapLibre: circulo azul
  de 14px con borde blanco y etiqueta pequena Pn, ambos sin capturar eventos.
  La alineacion de viewport conserva la legibilidad al cambiar zoom o pitch.
- Los marcadores DOM son independientes de las fuentes y capas del estilo.
  El render se sincroniza al inicializar, cambiar el input y en el handler
  `style.load` existente. Reutiliza identificadores, repone elementos
  desprendidos de su contenedor y elimina solo los puntos retirados del
  historial. Una instancia nueva reconstruye las representaciones desde el
  input del padre. Destruir una instancia limpia sus marcadores locales.
- No se crean fuentes/capas de terreno, elevacion, poligonos ni simulacion.

Referencias de API consultadas:
[Marker](https://maplibre.org/maplibre-gl-js/docs/API/classes/Marker/) y
[MapMouseEvent](https://maplibre.org/maplibre-gl-js/docs/API/classes/MapMouseEvent/).

## Separacion de acciones operativas

Se retiro una llamada preexistente a `agregarPunto()` dentro del setter
`coordenadaMapaSeleccionada` del formulario: esa llamada registraba vertices
automaticamente y contradecia la captura exclusivamente visual requerida.
Los campos siguen actualizandose, pero agregar un vertice requiere el boton
explicito. No se cambian formulas, calculos balisticos, backend ni poligonos.

## Verificacion

- Compilacion de desarrollo correcta; persiste el aviso previo NG8113.
- 44 pruebas aprobadas en Vulcano, MapaTresD, Mapa y Limites de Seguridad.
- La prueba compartida verifica las coordenadas Leaflet en los marcadores
  MapLibre, un clic MapLibre reflejado en Leaflet, etiquetas Pn, varias
  alternancias de vista, recargas de estilo sin duplicados y recuperacion de
  un elemento desprendido. Comprueba pausa, descarte de cielo y limpieza en
  ambos visores, sin solicitudes HTTP.
- Se mantienen pruebas de apertura/cierre, minimizacion/restauracion y ausencia
  de registro automatico de vertices o poligonos.
- Las pruebas DOM usan Leaflet y objetos Marker reales; simulan el contenedor,
  picking y eventos de MapLibre y su `Marker.addTo`, porque no hay WebGL en ese
  entorno. Pendiente revision visual manual con mapas remotos, terreno,
  zoom y pitch reales.
