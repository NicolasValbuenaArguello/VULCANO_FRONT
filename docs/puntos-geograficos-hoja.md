# Puntos geográficos en la hoja milimetrada

## Causa raíz

PUNTOS ya guardaba registros y su estado de graficación en el servicio root
`GeographicPointsService`. Los mapas 2D/3D recibían `geometria()` desde Vulcano,
pero la hoja solo consumía los registros anteriores y el último polígono de
Límites. No consultaba ese servicio ni tenía capas SVG para sus Features.
El fallo era de distribución y renderizado, no de CSS o borrado al cerrar.

## Flujo compartido

`VentanaPuntos.agregar()` → servicio `guardar()` → `graficar()` confirma IDs →
`geometria()` deriva Point y Polygon → hoja consulta el mismo servicio root →
proyección métrica existente → `toScreen()` → capas SVG propias.

No se añade otro evento GRAFICAR ni una copia persistente de los registros.
Las propiedades computadas son representaciones derivadas; comparten ID,
nombre, coordenadas y estilo con los mapas. Los registros no graficados y el
marcador temporal `puntos-preview` no se incorporan a esta capa confirmada.
Cerrar o limpiar el formulario no borra los IDs graficados del servicio.

## Transformación y navegación

Se reutiliza sin cambios `convertirWgs84AOrigenNacional(longitud,latitud)` de
la hoja, implementación existente de MAGNA-SIRGAS / Origen Nacional EPSG:9377.
Después se usa `toScreen`, que aplica el mismo centro, viewport y escala que
el resto de elementos. No se interpretan grados como coordenadas locales ni
se crea otro sistema de coordenadas.

Los círculos se reciben como anillos geográficos generados por PUNTOS a partir
del radio en metros. Se proyecta cada vértice del anillo y luego se aplica la
escala de la hoja. No se dibuja un circle de radio en píxeles igual al número
de metros. Se conserva la aproximación esférica de 96 segmentos del servicio,
incluida su diferencia respecto a distancias elipsoidales precisas.

`proyectarPuntoGeneral` comprueba rangos y números finitos, delega al
transformador actual y rechaza un resultado inválido. Si falla un centro no
se dibuja el punto; si falla un vértice del anillo no se dibuja un círculo
incompleto. No se sustituye por el origen ni por coordenadas aproximadas.

`centrarPuntosGenerales()` encuadra centros y anillos con el centro/zoom
existentes y conserva sus límites de zoom. Se llama al incorporar IDs nuevos;
editar estilo, cerrar PUNTOS o navegar no vuelve a centrar. El botón VER PUNTOS
permite recuperar el encuadre después de desplazar la cuadrícula. Geometrías
muy separadas pueden superar la extensión encuadrable con el zoom mínimo
existente; no se cambia ese límite ni las funciones anteriores de navegación.

## Capas

- `.puntos-generales-circulos`: relleno, opacidad, contorno y grosor por registro.
- `.puntos-generales-marcadores`: centro de tamaño legible en pantalla y etiqueta
  con nombre; colores propios y borde blanco.
- Ambas usan track por ID y pointer-events none. Se colocan después de los
  polígonos/curvas y antes de los elementos interactivos existentes para que
  estos conserven prioridad y no interceptar sus gestos.
- Las capas anteriores de elementos, Límites, curvas, selección, cursor y
  fijación no se sustituyen ni limpian.

El mensaje «Sin registros para mostrar» también considera los puntos
graficados para no presentarse sobre una hoja que ya contiene esta capa.

## Funciones y archivos

`hoja-milimetrada.component.ts`:

- `puntosGeneralesLocales`: derivación de centros/anillos métricos del servicio.
- `puntosGeneralesPantalla`: derivación SVG reactiva ante zoom y desplazamiento.
- `proyectarPuntoGeneral`: validación y reutilización de la transformación.
- `centrarPuntosGenerales`: encuadre explícito, sin mutar registros.
- `observarPuntosGenerales`: detección de nuevos IDs y diagnóstico condicionado
  a desarrollo. No contiene nombres, coordenadas, credenciales ni cuerpos.
- `ngAfterViewInit`: informa que la hoja está inicializada para el encuadre.

`hoja-milimetrada.component.html`: capas nuevas, etiquetas, botón de encuadre y
estado vacío. `puntos-generales.spec.ts`: pruebas de integración dedicadas.

No se modifican servicios de datos, mapas, backend, JWT, cálculos, simulación
o funciones existentes de proyección; se reutilizan.

## Diagnóstico de desarrollo

`[PUNTOS][HOJA]` registra únicamente cantidadRecibida, cantidadTransformada,
hojaInicializada y escalaDisponible. Los valores se obtienen de los Features,
proyección realizada y escala real. Está desactivado en producción. No produce
HTTP, no registra coordenadas ni reinicia la cámara al hacer zoom/pan.

## Pruebas y límites

23 pruebas aprobadas en cuatro suites: hoja principal, nueva integración de
puntos, servicio geográfico y ventana PUNTOS. Comprueban:

1. Registrar desde la ventana no dibuja hasta GRAFICAR.
2. El origen conocido lon=-73/lat=4 se transforma a 5000000/2000000 metros.
3. Centro visible tras encuadre y anillo de 97 posiciones (incluye cierre).
4. Radio de 1000m proyectado con su escala, sin usar un radio fijo en píxeles.
5. Zoom ×1.5 multiplica la distancia visual del anillo por ×1.5.
6. Desplazamiento mantiene la correspondencia exacta con centro y escala.
7. Segundo punto conserva el primero; render repetido no duplica círculos.
8. Cambio de marcador y opacidad se refleja sin reiniciar la navegación.
9. Cerrar/recrear PUNTOS conserva registros y representaciones.
10. Los elementos anteriores permanecen iguales y no hay solicitudes HTTP.
11. Una proyección rechazada no genera marcador ficticio.

Compilación de desarrollo correcta, con aviso NG8113 previo del import de
Límites. Las pruebas usan DOM; queda pendiente revisión visual manual.

EPSG:9377 es una proyección regional: reutilizarla no acredita precisión global
fuera de su área de uso. Esta tarea no modifica ni valida globalmente la serie
de transformación existente. Tampoco añade tratamiento nuevo de polos o
antimeridiano al generador de círculos. La persistencia sigue siendo solo en
memoria durante la aplicación abierta; recargar la página elimina los puntos.
