# Control visual de captura de coordenadas

> Actualizacion: el comportamiento integrado ahora conserva un historial P1,
> P2, P3... La especificacion vigente esta en
> [historial de captura visual](historial-captura-visual.md). Los apartados de
> marcador unico y retirada al desactivar describen la version anterior;
> la demostracion independiente permanece como muestra de esa version.

## Interfaz y comportamiento

El encabezado de coordenadas de Limites de Seguridad incorpora un boton con
icono de cursor y estados ACTIVADA (verde tenue) / DESACTIVADA (gris oscuro).
`aria-pressed`, un nombre accesible, foco verde y un mensaje de estado comunican
el modo sin depender solo del color. La cuadricula de campos no cambia.

El estado pertenece a `Vulcano`, se transmite por `Menu` a la ventana y vuelve
mediante outputs. Inicia activado para conservar la captura de la integracion
anterior. Cerrar o minimizar la ventana no cambia el modo; al reabrir se puede
desactivar con el mismo boton. No se persiste entre recargas.

Desactivar conserva los campos y la ultima ubicacion, oculta el marcador e
ignora nuevos clics para esta captura. Reactivar muestra la ultima seleccion;
el siguiente clic reemplaza ambos campos y desplaza el mismo marcador.

## Capa de vista previa

`MapaComponent` recibe `coordenadaVistaPrevia` y mantiene un `CircleMarker`
independiente: radio 6px, relleno azul, borde blanco, sin interaccion. Usa
`overlayPane`, debajo de los marcadores y controles Leaflet. No tiene popups,
no intercepta clics y no cambia zoom o centro. Se retira al desactivar o destruir
el componente. No se agregan listeners: se reutiliza el `mapClick` existente.

Esta capa agrega el marcador que se habia omitido en la primera integracion,
documentada en `captura-coordenadas-mapa-2d.md`.

No existe conexion con AGREGAR PUNTO, registro de vertices o poligonos,
simulaciones, backend ni persistencia operativa. Los validadores geograficos
y las conversiones existentes no se modifican. Los marcadores operativos se
conservan en sus colecciones existentes.

## Demostracion independiente

Abrir `demos/coordinate-preview/index.html` directamente en el navegador.
No requiere servidor, dependencias, credenciales, tiles ni backend. Muestra
el boton, los estados, una superficie esquematica y un unico marcador circular
en una capa visual. La superficie no representa geografia real: expresa la
ubicacion en porcentajes. Permite clic o Enter/Espacio para seleccionar el
centro; el boton admite el teclado nativo. Los controles estan fuera de la
superficie y el marcador no puede taparlos.

## Verificacion

- Compilacion de desarrollo Angular correcta. Persiste el aviso previo NG8113.
- 45 pruebas aprobadas en Vulcano, Menu, Limites de Seguridad y Mapa.
- Prueba de integracion ampliada: boton real y propagacion del estado,
  coordenadas conservadas al desactivar, retirada de capa, reactivacion,
  reutilizacion de un marcador y ausencia de registros/poligonos/HTTP.
- Prueba DOM de la demostracion: clic, desactivacion, reactivacion, teclado
  y marcador unico correctos.
- Pendiente revision visual manual en navegador; las pruebas DOM no comprueban
  la composicion visual con mapas remotos cargados.
