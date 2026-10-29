# PUNTOS en ACCIONES DEL MAPA

## Integración

Se reutiliza el componente existente `ventana-puntos`, que antes solo mostraba
el texto generado por Angular. Ahora es standalone y extiende
`FloatingWindowBase`: emplea el mismo `WindowManagerService`, geometría,
límites mínimos (420×300 o el viewport disponible), arrastre, ocho bordes de
redimensionamiento, minimizar, maximizar/restaurar y limpieza de gestos de
las ventanas actuales. No se crea otra implementación del gestor.

El cuerpo muestra únicamente «Área de gestión de puntos». No contiene negocio,
formularios, consultas HTTP, persistencia ni operaciones sobre mapas.
Reutiliza menu.css y ventana-sistemas-artilleria.css para encabezado y controles;
la hoja propia solo define el espacio vacío y el foco de la ventana.

`MapActionsService` agrega la cuarta acción `puntos`, debajo de Límites de
Seguridad, con icono ⊕ y el mismo elemento de menú, navegación por teclado,
hover y cierre. El servicio es el compartido por Leaflet y MapLibre: no se
agrega ningún listener cartográfico ni otro menú contextual.

`Vulcano` recibe la acción por la suscripción existente y llama a
`Menu.openPuntosWindow()`, sin pasar por Proyectar. El menú contextual se cierra
antes de emitir la solicitud, como para las otras opciones.

`Menu` conserva una única instancia mediante `@if (puntosWindowOpen)` y el
contenedor floatingWindowsHost existente, compatible con fullscreen. Si ya
existe, `openPuntosWindow()` la restaura y enfoca. `activatePuntosWindow()`
comparte el orden de superposición con Límites, Sistemas, Graficar e Iconos.
Las funciones existentes de activación también consideran el z-index de
PUNTOS para poder traer cualquier ventana al frente.

Minimizar oculta el cuerpo con hidden sin destruir el componente. Cerrar
destruye solo PUNTOS; no modifica Límites, captura, polígonos ni capas del mapa.
Al maximizar/restaurar se conserva la geometría normal mediante la base común.
Los botones del encabezado no inician arrastre.

## Archivos modificados

- `ventana-puntos.ts/html/css`: adaptación del componente existente a ventana
  flotante y documentación de responsabilidades en TypeScript.
- `map-actions.service.ts`: tipo de acción, cuarta opción e icono.
- `menu.ts/html`: import standalone, estado local, apertura, activación y
  render de una instancia; actualización del orden de superposición.
- `vulcano.ts`: distribución explícita de la nueva acción.
- Specs de PUNTOS y Vulcano: gestos y flujo real de menú a ventana.
- Specs de menú contextual y Límites: expectativa de cuatro opciones en lugar
  de tres; los índices de las tres opciones anteriores se mantienen.

No se modifican backend, autenticación, endpoints, geometrías, mapas base,
captura de coordenadas ni el comportamiento de creación de Límites.

## Pruebas y resultados

Compilación `npx ng build --configuration development`: correcta. Persiste el
aviso NG8113 anterior del import de Límites en Vulcano.

Ejecución de ventana-puntos.spec.ts, vulcano.spec.ts, menu.spec.ts y
map-context-menu.spec.ts: **21 aprobadas y 3 fallidas**. Las pruebas nuevas de
PUNTOS pasan y verifican:

1. Cuarta opción PUNTOS y cierre del menú contextual al seleccionarla.
2. Apertura de la ventana correcta y ausencia de instancias duplicadas.
3. Arrastre por encabezado; botones que no arrastran.
4. Redimensionamiento hasta los mínimos y ocho controles de borde/esquina.
5. Minimizar/restaurar sin recrear; maximizar/restaurar conserva rectángulo.
6. Cerrar solo PUNTOS y coexistencia con Límites.
7. Orden de superposición independiente en ambas direcciones.
8. Conservación de vértices de Límites, colección de captura y polígonos y
   capas Leaflet existentes; ausencia de solicitudes HTTP.

Los tres fallos corresponden a expectativas anteriores del editor de Límites,
no al flujo nuevo de PUNTOS:

- Dos casos de reapertura esperan `LISTO PARA AGREGAR PUNTOS`, pero el estado
  actual entrega `VÉRTICES LIMPIADOS`.
- Una prueba de captura espera vertices vacío, pero el setter actual de
  coordenadas registra cuatro vértices después de cuatro selecciones.

No se cambió esa lógica ni se relajaron esas expectativas para dar por aprobada
la suite. Debe revisarse separadamente si ese comportamiento actual de Límites
es deliberado. Las comprobaciones son DOM/unitarias; queda pendiente revisión
visual manual en navegador, incluida la apariencia en fullscreen.
