# Reinicio del editor al abrir un nuevo polígono

## Causa verificada

`Menu` crea/destruye `VentanaLimitesSeguridad` mediante
`@if (limitesWindowOpen)`. Cerrar destruye la instancia; minimizar conserva
la instancia y oculta su contenido. El problema no era un ngOnInit omitido.

El padre conserva `coordenadaMapaSeleccionada`. Al recrear el formulario, ese
input vuelve a recibir la última captura y su setter llamaba a `agregarPunto()`.
Por eso una instancia nueva empezaba con un vértice aunque `vertices` se
inicializara vacío. Se retiró esa llamada: recibir coordenadas solo llena DMS;
registrarlas en el borrador exige el botón AGREGAR PUNTO.

## Corrección

- `Menu.openLimitesWindow()` incrementa `limitesNuevaApertura` solo cuando pasa
  de cerrada a abierta. Restaurar la ventana ya abierta no cambia ese contador.
- `menu.html` transmite la revisión mediante `nuevaApertura`.
- El setter invoca `reiniciarNuevoPoligono()`, también válido si se reutiliza
  una instancia. No depende exclusivamente de ngOnInit ni de AfterViewInit.
- El reinicio reutiliza `limpiarVertices()`: invalida resultados y callbacks
  pendientes, vacía vértices, cancela selección de edición y reinicia IDs.
  Además vacía nombre/descripción y restablece coordenadas predeterminadas y
  el mensaje LISTO PARA AGREGAR PUNTOS. No modifica el estilo seleccionado.
- El visor deriva círculos, etiquetas y geometría de `vertices`; no necesita
  una segunda colección. Con cero puntos tampoco crea un polyline vacío.

Los campos pueden mostrar la última captura si el input de coordenadas se
aplica después del reinicio; eso no registra ningún vértice. Los marcadores
compartidos de captura visual en los mapas 2D/3D se conservan: son otra colección
y no son los vértices ni los marcadores Pn del visor interno del borrador.

## Edición y límites del alcance

Se conserva `editarVertice` y su índice al minimizar/restaurar o
maximizar/restaurar. El reinicio se asocia exclusivamente a nueva apertura;
no se ejecuta al editar un vértice ni al recibir nuevas coordenadas.

Esta ventana no dispone de un flujo actual para seleccionar y cargar un
polígono persistido en modo edición. Por tanto, no se inventa uno ni se prueba
una carga backend inexistente. Si se añade ese flujo, debe cargar explícitamente
el registro sin disparar una solicitud de nueva creación. No se modifica
ningún endpoint, servicio de persistencia o registro guardado.

## Verificación

Pruebas `menu.spec.ts` y `vulcano.spec.ts`: 15 aprobadas. Las nuevas pruebas
comprueban primera apertura vacía aun con última coordenada retenida, agregar
uno o tres vértices, cerrar y recrear con cero puntos, nombre y estado inicial,
ausencia de círculos/textos/líneas/polígono, ID P1 tras agregar de nuevo,
restauración sin pérdidas, edición local conservada y reinicio de la misma
instancia al cambiar la revisión de nueva apertura. Se verifica ausencia de
peticiones HTTP en estos escenarios. Los mapas, autenticación, dibujo y
registro HTTP existente al graficar no se modifican.
