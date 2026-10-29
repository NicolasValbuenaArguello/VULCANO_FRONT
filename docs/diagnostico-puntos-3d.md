# Diagnóstico de PUNTOS en MapLibre 3D

## Evidencia previa a la corrección

El input `puntosGeograficos` ya recibe `puntosState.geometria()` desde Vulcano,
incluida la colección creada antes de activar el bloque diferido 3D. Sus Point
usan [longitud,latitud] y los radios son anillos geográficos, no píxeles.

La falla comprobable está en `MapLibrePointLayer.sync`: retorna inmediatamente
si `map.isStyleLoaded()` es false. `handleStyleLoad` llama a ese método, pero
`handleMapLoad` no lo hacía. En el paquete instalado:

- `node_modules/maplibre-gl/src/style/style.ts`, `_load` marca `_loaded=true`,
  incorpora fuentes y después emite style.load.
- `Style.loaded()` también exige fuentes/teselas e imágenes cargadas y que
  `_updatedSources` esté vacío; `Map.isStyleLoaded()` delega en ese método.
- Por ello style.load no garantiza isStyleLoaded=true. También puede ser false
  durante una actualización GeoJSON, dejando cambios posteriores sin aplicar.

No se encontró falta de distribución del estado, inversión lon/lat o limpieza
de registros al cambiar de vista. Además faltaban etiquetas de nombre y una
política explícita de visibilidad de centros frente al terreno. No se verificó
el navegador del usuario ni se atribuye toda causa visual posible a este caso.

La corrección se limita al ciclo de vida y representación 3D de PUNTOS; no
modifica el adaptador Leaflet, la hoja, estado persistente, terreno u otras
capas.

## Corrección e integración

`MapLibrePointLayer.sync(map,data,styleReadyEvent)` distingue entre estilo
preparado para aceptar fuentes/capas y todas las teselas cargadas. Los eventos
oficiales style.load/load habilitan la sincronización aunque isStyleLoaded
todavía sea false. Actualizar GeoJSON tampoco bloquea los siguientes cambios
por teselas pendientes. No se accede a propiedades privadas del motor en
producción; las fuentes instaladas solo se inspeccionaron para el diagnóstico.

`handleStyleLoad` y `handleMapLoad` reutilizan el input actual, que permanece
disponible si llegó antes de inicializar el visor diferido. Un listener estable
styledataloading invalida solo la disponibilidad del estilo de PUNTOS. Se
registra en bindMapEvents y se retira al destruir; no se registra por cada
actualización. `onVistaVisible` sincroniza al regresar a 3D, sin centrar cámara.

El adaptador conserva únicamente objetos gráficos por ID y la referencia al
último FeatureCollection procesado, no otra colección de registros de negocio.
La fuente GeoJSON compartida sigue definiendo anillos/radios y estilos. setData
se ejecuta al cambiar el input y las capas se crean solo si faltan; al sustituir
el estilo se reconstruyen desde el input actual. No se usa un bucle idle,
temporizador ni render continuo para reintentar.

Los centros usan `Marker` DOM de MapLibre, con nombre mediante textContent,
color/tamaño individual, borde blanco y alineación viewport. Se configuran
opacity=1 y opacityWhenCovered=1 para mantener el indicador identificable
aunque MapLibre detecte cobertura de terreno. Es una elección de presentación:
el indicador no pretende medir visibilidad física ni línea de visión. No se
eleva ni modifica el terreno. Los anillos siguen usando fill/line sobre la
superficie y pueden quedar parcialmente ocultos naturalmente por relieve.

La antigua capa puntos-generales-center, si aún existe en el estilo, se retira
para no superponer dos representaciones del centro. Solo se elimina esa capa
propia; no se toca ninguna otra. Los marcadores se actualizan/reutilizan por ID,
se retiran al eliminar su Feature y se liberan al destruir el mapa. Los cambios
de estilo conservan esos marcadores, que no dependen del estilo vectorial.

Diagnóstico `[PUNTOS][3D]` solo en desarrollo: puntosRecibidos,
visorInicializado, capaDisponible y geometriaProcesada. Se limita a cambios de
conteos/estado y no muestra nombres, coordenadas, credenciales o cuerpos.

## Archivos modificados

- `shared/geographic-points/point-layers.ts`: solo la clase MapLibrePointLayer;
  el adaptador Leaflet permanece intacto.
- `pages/vulcano/mapa-tres-d/mapa-tres-d.ts`: ciclos style.load/load,
  styledataloading, retorno a la vista y destrucción.
- `geographic-points.spec.ts`: expectativas del adaptador 3D (dos capas de
  anillo más marcadores DOM), sin cambiar las pruebas Leaflet.
- Nuevo `point-layers-3d.spec.ts`: reproducción de carga parcial y actualizaciones.
- `mapa-tres-d.spec.ts`: prueba del evento del componente real con input previo.

No se cambia el estado de PUNTOS, su persistencia en memoria, endpoints, JWT,
simulaciones, polígonos o la hoja milimetrada.

## Pruebas y resultados

Compilación de desarrollo correcta, con aviso NG8113 previo del import de
Límites en Vulcano.

**20 pruebas aprobadas en cinco suites**, sin fallos en esta ejecución:
servicio/adaptadores geográficos, nueva regresión 3D, componente MapLibre,
PUNTOS en la hoja y ventana PUNTOS.

La regresión reproduce isStyleLoaded=false antes de la carga y durante
style.load, verifica datos previos a la creación del mapa, posición lon/lat,
varios puntos, colores/radio/opacidad, edición durante carga de fuentes,
eliminación de un ID, restauración tras sustituir estilo y limpieza de objetos
gráficos al destruir. La prueba del componente dispara los handlers reales
registrados para style.load y styledataloading. Se comprueba que el mismo input
no vuelve a enviar setData ni duplica marcadores. Las suites de hoja, ventana
y Leaflet continúan pasando sin cambios funcionales en esas vistas.

## Pendientes y límites de la evidencia

Las pruebas usan objetos Marker reales con addTo simulado y un mapa sin WebGL;
verifican la política de opacidad, no una imagen real de terreno. Falta validar
visualmente con GPU, DEM y teselas remotas el relieve, pitch, zoom y cambios
repetidos de vista. No se afirma haber reproducido la sesión del navegador del
usuario ni se descartan causas adicionales como puntos fuera de cámara o un
fallo de red de datos base. Esta corrección no cambia el encuadre.

Se conservan las limitaciones del generador geográfico de círculos (aproximación
esférica, polos y antimeridiano). No se ejecutaron mutaciones backend ni se
alteró su contrato. La sesión de PUNTOS continúa en memoria, no sobrevive a
recargar la página.
