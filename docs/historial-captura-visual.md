# Historial de captura visual de coordenadas

El historial tambien se comparte con MapLibre 3D. Ver
[captura compartida 2D/3D](captura-visual-compartida-2d-3d.md).

Cada clic valido recibido por el `mapClick` existente, mientras la captura esta
activada, agrega un punto al historial local de `Vulcano`. La ultima seleccion
sigue actualizando el formulario. No se agrega otro listener.

## Marcadores

- `PuntoCapturaVisual` contiene latitud, longitud e identificador consecutivo.
- `MapaComponent` recibe la coleccion inmutable `puntosCapturaVisual` y agrega
  solo los marcadores nuevos a una coleccion propia por identificador.
- Cada punto conserva el circulo azul con borde blanco y tiene una etiqueta
  permanente P1, P2, P3... El circulo y su etiqueta no reciben clics y usan
  `overlayPane`, debajo de los controles y marcadores operativos.
- Leaflet mantiene las coordenadas geograficas al desplazar y ampliar el mapa.
- Clics repetidos en una misma ubicacion tambien generan puntos consecutivos;
  pueden superponerse porque representan la misma posicion geografica.

Desactivar solo suspende la captura: no cambia la coleccion ni oculta puntos.
Reactivar permite continuar con el siguiente numero. Cerrar o minimizar la
ventana tampoco limpia el historial. Es estado local de la vista, sin backend
ni persistencia entre recargas.

La captura inicia desactivada y vuelve a desactivarse al cerrar y en cada
apertura nueva de la ventana. Requiere activacion manual. Minimizar y restaurar
la misma ventana conserva el estado actual, incluso al restaurarla desde el
menu. El reinicio reutiliza `capturaCoordenadasActivaChange` y no limpia puntos.

## Limpieza

El boton LIMPIAR VISTA PREVIA muestra el numero de puntos y queda deshabilitado
si no hay ninguno. Con puntos existentes pide confirmacion nativa. Cancelar
conserva todo; confirmar vacia solo el historial visual y elimina sus circulos
y etiquetas. La siguiente captura vuelve a P1.

La limpieza no cambia las coordenadas visibles, el modo activado/desactivado,
vertices, registros, poligonos, capas ajenas, calculos o simulaciones. No se
modifican validadores geograficos ni se efectuan solicitudes HTTP.

## Archivos y verificacion

Se actualizan los bindings de Vulcano, Menu y Limites de Seguridad, el render
de vista previa de Mapa, el modelo local y estilos exclusivos de etiquetas y
boton. Los estilos globales solo afectan `.coordinate-preview-label` de Leaflet.

45 pruebas aprobadas en Vulcano, Menu, Limites de Seguridad y Mapa. La prueba
de integracion verifica P1/P2/P3, nuevas capturas consecutivas, pausa sin
eliminacion, reactivacion, posiciones tras zoom/desplazamiento, cancelacion y
confirmacion de limpieza, conservacion de una capa ajena y reinicio en P1.
Tambien comprueba ausencia de registros operativos y solicitudes HTTP.

Compilacion de desarrollo correcta; persiste el aviso previo NG8113. Queda
pendiente la revision visual manual con los mapas remotos cargados.
