# Puntos desde el menú de la hoja milimetrada

## Integración y estado compartido

La opción se agrega después de Límites de seguridad en `.element-menu` de
`hoja-milimetrada.component.html`, con el mismo button y los estilos existentes.
Las opciones anteriores y sus manejadores permanecen sin cambios.

En `hoja-milimetrada.component.ts`, `solicitarPuntos()` únicamente cierra el
menú (`contextId=null`) y emite el nuevo output `abrirPuntos`. No cambia
selectionId/selectedId, elementos, coordenadas, proyección ni fijación.

`vulcano.html` conecta ese output directamente a `menu.openPuntosWindow()`.
Es la misma función que ya utiliza la acción PUNTOS del menú compartido de
Leaflet/MapLibre. `Menu` conserva un solo `puntosWindowOpen`, un solo z-index
y un solo ViewChild de `VentanaPuntos`. No se crean otro componente, servicio,
gestor, colección de ventanas o estado de apertura para la hoja.

Abrir desde un segundo acceso restaura y enfoca la instancia existente, o la
crea si fue cerrada. Minimizar, maximizar, restaurar, arrastrar, redimensionar
y cerrar conservan el comportamiento anterior de FloatingWindowBase. PUNTOS
sigue siendo una ventana vacía sin acciones de negocio ni solicitudes HTTP.

## Archivos modificados

- `hoja-milimetrada.component.html`: botón Puntos al final del menú.
- `hoja-milimetrada.component.ts`: output y método documentados.
- `vulcano.html`: binding al gestor de apertura existente.
- `vulcano.spec.ts`: integración entre los dos menús y conservación de datos.

No se modifican backend, endpoints, JWT, cálculos, estilos ni funciones de
proyección/fijación.

## Validación

Compilación de desarrollo correcta, con el aviso previo NG8113 del import de
Límites en Vulcano.

Se ejecutaron las suites Vulcano, VentanaPuntos, HojaMilimetrada y Proyectar:
**23 pruebas aprobadas y 2 fallidas**. La prueba nueva pasa y comprueba:

- Orden exacto de las cinco opciones y clic sobre Puntos.
- Cierre del menú de la hoja antes de mostrar la ventana.
- Apertura desde mapa y luego hoja sin crear otra instancia, con aumento de z-index.
- Cierre y reapertura desde hoja; minimizar y restaurar desde mapa.
- Una sola ventana; maximizar y restaurar conservan el flujo existente.
- Conservación de elementos y selección de la hoja, registros, colección de
  polígonos y capa Leaflet existente, sin solicitudes HTTP.

Las pruebas de VentanaPuntos pasan: arrastre, botones que no arrastran,
redimensionamiento, minimizar/restaurar y maximizar/restaurar. La suite principal
de la hoja también pasa y cubre funcionalidades existentes.

Los dos fallos observados pertenecen a pruebas anteriores, fuera del código
modificado para este acceso:

1. `presents successive Leaflet clicks...` espera que capturar no registre
   vértices; el setter actual de Límites agrega cuatro vértices.
2. `usa la funcion existente y conserva el tipo del registro al proyectar`
   espera una llamada a registrarCoordenadas que no se produce.

No se cambiaron esas funciones ni se relajaron las pruebas para ocultar esos
resultados. No se afirma que toda la suite pase. Las pruebas usan DOM y HTTP
simulado; queda pendiente la revisión visual manual en navegador.
