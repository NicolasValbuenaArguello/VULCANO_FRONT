# Gestión general de puntos geográficos

## Funciones disponibles

La ventana PUNTOS existente conserva FloatingWindowBase, las aperturas desde
mapa/hoja y los controles de arrastre, tamaño, minimizar, maximizar y cerrar.
Se amplía a una distribución de dos columnas adaptable al ancho de la ventana.
No se recibió un archivo de imagen de referencia en esta solicitud; se sigue
la distribución y paleta descritas: verde oscuro, negro, oliva, dorado y azul.

Columna izquierda: nombre obligatorio, observaciones, DMS con hemisferios,
decimal WGS84 editable, selección de un clic en mapa, radio, relleno/opacidad,
contorno/grosor y color/tamaño central. Una vista SVG esquemática refleja el
radio y estilo actuales. El radio del dibujo SVG no es una escala cartográfica.

Columna derecha: tabla con número, nombre, coordenadas, radio y Ver/Editar/Eliminar;
contador e información del registro seleccionado. Agregar confirma una fila;
editar conserva el ID y cambia solo esa fila; eliminar requiere confirmación.
GRAFICAR PUNTOS representa los registros sin borrar los anteriores.

## Estado, captura y conservación

`GeographicPointsService`, providedIn root, conserva registros e IDs estables
en signals. Es específico de puntos generales con radios y estilos: el
historial de captura de Límites no conserva ese contrato y los servicios GIS
existentes corresponden a polígonos o registros operativos. No se reutilizan
esas colecciones como almacenamiento de la herramienta nueva.

Se distinguen:

- Formulario temporal: propiedad de VentanaPuntos; sus cambios no mutan una fila
  antes de guardar. Cerrar descarta cambios no confirmados.
- Registros confirmados: propiedad del servicio; sobreviven a destruir/recrear
  la ventana. No usan localStorage, archivos, autenticación ni solicitudes HTTP.
- IDs graficados: determinan qué registros tienen geometría. Un nuevo registro
  no dibuja su círculo hasta GRAFICAR PUNTOS. Editar uno ya dibujado actualiza
  su posición/estilo; eliminarlo retira solo sus geometrías.
- Ubicación temporal: marcador de un clic capturado; nunca agrega una fila.

El modo SELECCIONAR EN MAPA usa los eventos mapClick existentes. Vulcano primero
ofrece el clic al servicio de PUNTOS; si este lo consume, no agrega un punto al
historial de captura de Límites. El modo se desactiva tras la selección válida.
Un clic inválido no lo desactiva. La ventana recibe la ubicación mediante un
effect del signal y actualiza DMS/decimal sin enfocar inputs.

MapLibre conserva el picking geográfico de terreno y descarte de cielo ya
implementados; no se interpreta una coordenada de pantalla como lon/lat.
No se agregan listeners de mapas ni HTTP. Cerrar PUNTOS cancela su captura
pendiente y elimina solo el marcador temporal. Minimizar/restaurar conserva
formulario y captura actuales; los registros y geometrías dibujados permanecen.

**Conservación en memoria durante la aplicación abierta no equivale a persistencia
tras recargar la página.** Una recarga crea otro servicio y una colección vacía.

## Conversión y geometrías

`toDms` y `fromDms` están separados del formulario y del estado. DMS valida
grados/minutos enteros, segundos 0≤s<60, rangos geográficos y hemisferios.
Un input numérico vacío no se acepta como cero. DD se descompone con acarreo
a seis decimales de segundo. Los registros conservan los decimales numéricos;
la tabla muestra seis decimales para lectura.

El servicio valida nombre de 1..150 caracteres, observaciones hasta 2000,
coordenadas WGS84 finitas, radio 1..100000 metros, opacidad 0..1, grosor 1..12px,
marcador 3..20px y colores RGB hexadecimales. Los límites se muestran también
en los controles HTML. La validación no modifica los validadores de otros módulos.

`geographicCircle` calcula destinos esféricos para 96 rumbos a distancia
radio/6371000 radianes; cierra el anillo copiando el primer vértice. Los grados
son el resultado del cálculo, no una interpretación directa del radio métrico.
Usa la misma esfera media que `horizontalDistance` del módulo de medición para
verificación. Es una aproximación cartográfica, no un cálculo elipsoidal de
levantamiento o una zona operativa. Los radios se guardan individualmente.

Ambos motores reciben el mismo FeatureCollection derivado: un Point central y
un Polygon por registro graficado, con sus IDs y propiedades visuales. La vista
temporal agrega únicamente un Point. Leaflet usa GeoJSON y circleMarker de
tamaño en píxeles; su adaptador retira/recrea exclusivamente su grupo al cambiar
los datos, preservando todos los registros graficados en la nueva representación.
MapLibre usa la fuente exclusiva `puntos-generales` y tres capas (fill, line,
circle), con estilo por feature; actualiza setData y reconstruye al cambiar
estilo. No toca fuentes/capas de polígonos, terreno, medición o simulación.

El terreno y la perspectiva de MapLibre pueden alterar la forma aparente del
círculo; Leaflet muestra una proyección plana. Los marcadores centrales usan
tamaños de pantalla legibles. No se añaden medidas balísticas ni lógica de
armamento.

## Responsabilidades y métodos

| Código | Entrada / salida / responsabilidad |
|---|---|
| `toDms(value, latitude)` | DD y eje → Dms; cálculo puro, sin eventos |
| `fromDms(dms, latitude)` | DMS y eje → number o null; cálculo puro |
| `geographicCircle(point, meters)` | WGS84 y metros → GeoJSON Polygon aproximado |
| `validar(record)` | Datos sin ID → mensaje o null; no muta estado |
| `guardar(record, id?)` | Datos e ID opcional → registro; valida y agrega/actualiza signals |
| `capturar(point)` | WGS84 → boolean consumido; publica temporal y desactiva captura, sin registrar |
| `graficar()` | Sin parámetros → void; confirma los IDs visibles, sin HTTP |
| `eliminar(id)` | ID → void; elimina solo su registro, selección y geometría |
| `cambiarDms/cambiarDecimal` | Eje → void; sincroniza exclusivamente el formulario |
| `seleccionarMapa()` | Sin parámetros → void; alterna la captura de un clic |
| `agregar()` | Sin parámetros → void; confirma formulario mediante guardar y presenta mensaje |
| `ver/editar/eliminar(record)` | Fila → void; muestra información, copia al borrador o confirma eliminación |
| `nuevo()` | Sin parámetros → void; limpia nombre/observaciones/edición y temporal; conserva registros y estilo |
| `ngOnDestroy()` | Cancela captura/temporal y delega limpieza de ventana; no elimina registros |
| Adaptadores `sync(map,data)` | Motor y FeatureCollection → void; gestionan solo sus capas locales |

No se añaden outputs de negocio: los accesos a la ventana mantienen los eventos
anteriores; datos y captura nuevos se comunican por el servicio compartido.

## Archivos

- `shared/geographic-points/geographic-points.ts`: modelos, conversiones,
  círculos y servicio de sesión.
- `shared/geographic-points/point-layers.ts`: adaptadores de representación.
- `ventana-puntos.ts/html/css`: formulario, vista previa, tabla e información.
- `vulcano.ts/html`: distribución del clic y geometrías derivadas a ambos mapas.
- `mapa.ts` y `mapa-tres-d.ts`: input y sincronización de capas propias; limpieza
  Leaflet y restauración MapLibre en los ciclos existentes.
- Specs del servicio, ventana y Vulcano: pruebas de funcionalidad e integración.

## Pruebas y limitaciones

- Compilación de desarrollo correcta; persiste el aviso previo NG8113 de Límites.
- Suite específica final: **11 pruebas aprobadas**. Registro y observaciones,
  IDs, varios radios/colores independientes, edición/transparencia, eliminación
  confirmada, inputs reales DMS/decimal, cierre/recreación, controles de ventana,
  círculo cerrado a la distancia métrica configurada y capas sin duplicados.
- Ejecución ampliada: **35 aprobadas y 1 fallida**, antes de agregar la última
  prueba de inputs/eliminación. La integración nueva verifica captura real
  Leaflet y evento/picking MapLibre simulado, marcador temporal, desactivación
  y ausencia de registro automático. Las otras suites de motores pasan.
- El fallo conocido de `presents successive Leaflet clicks...` sigue esperando
  cero vértices en Límites mientras su setter actual agrega cuatro. No se
  modificó esa lógica ni su expectativa para ocultar el resultado.
- No se invoca backend ni se modifican JWT, endpoints o datos operativos.
- MapLibre se prueba sin WebGL real. Falta revisión visual manual con terreno,
  zoom, pitch y fullscreen; no se verificó coincidencia con una imagen ausente.
- La aproximación circular no divide geometrías en el antimeridiano ni maneja
  específicamente casquetes polares. Longitudes del anillo pueden superar
  ±180 para continuidad cerca del meridiano de cambio de fecha. Esos casos
  extremos requieren revisión visual antes de usarlos; no se promete precisión
  geodésica elipsoidal ni representación polar en Web Mercator.
