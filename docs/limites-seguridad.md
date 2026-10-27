# Ventana Limites de seguridad

## Integracion

La opcion de pieza esta en el menu contextual de Hoja Milimetrada, no en `menu-sistemas`. Se agrega un boton junto a Ver informacion, Proyectar y Fijar, conservando sus clases y acciones. Su altura sigue siendo automatica; se reserva mas margen inferior al ubicar el menu para acomodar el nuevo boton.

`solicitarLimitesSeguridad()` cierra el menu de pieza y emite `abrirLimitesSeguridad`. La plantilla Vulcano conecta ese evento con `Menu.openLimitesWindow()`.

El menu ACCIONES DEL MAPA se genera en MapActionsService y es comun a Leaflet y MapLibre. Agrega `limites-seguridad` con icono discreto; conserva las coordenadas y las otras acciones. Vulcano reconoce la nueva identidad y llama al mismo `openLimitesWindow()`, sin pasar por Proyectar.

Menu mantiene un booleano y un ViewChild de la unica ventana: si existe, restaura y enfoca la instancia; si no, la crea. Cerrar elimina esa instancia y permite abrir otra despues. La nueva ventana pertenece al contenedor flotante ya trasladado durante fullscreen. Su z-index participa en el mismo maximo de Sistemas, Graficar e Iconos.

## Reutilizacion y recursos

`FloatingWindowBase` extrae el comportamiento que ya tenia VentanaSistemasArtilleria: registro y limites mediante WindowManagerService, arrastre Pointer Events, ocho bordes/esquinas, captura, cancelacion, minimizacion, restauracion y maximizacion. Sistemas y Limites lo heredan, evitando mantener dos implementaciones del comportamiento. No se crea otro servicio gestor ni se modifica WindowManagerService. Se conserva el ambito del proveedor por componente empleado por Sistemas.

La nueva ventana se registra como `limites-seguridad`, con titulo LÍMITES DE SEGURIDAD y tamano preferido 850x550, centrado y acotado al viewport. El cuerpo solo contiene el titulo provisional y la frase reservada. No hay coordenadas, formularios, calculos ni peticiones HTTP del modulo.

Minimizar oculta el cuerpo y deja el encabezado con restauracion; no destruye la instancia. Maximizar proyecta el rectangulo al viewport y conserva la geometria normal. El foco va al dialogo al abrir/restaurar. Al cerrar o destruir se libera captura de puntero y se elimina el registro; Angular retira los HostListener heredados. Los controles reutilizan las hojas de estilo existentes y un CSS local para el texto provisional.

## Archivos de esta fase

Creado:

- `src/app/shared/components/window-workspace/floating-window-base.ts`
- `src/app/pages/vulcano/ventana-limites-seguridad/ventana-limites-seguridad.ts`
- `src/app/pages/vulcano/ventana-limites-seguridad/ventana-limites-seguridad.html`
- `src/app/pages/vulcano/ventana-limites-seguridad/ventana-limites-seguridad.css`
- `src/app/pages/vulcano/ventana-limites-seguridad/ventana-limites-seguridad.spec.ts`

Modificado:

- `ventana-sistemas-artilleria.ts`: hereda el comportamiento compartido, conservando su menu y contenidos actuales.
- `menu.ts` y `menu.html`: instancia unica, apertura, restauracion y orden visual.
- `vulcano.ts` y `vulcano.html`: conectan las dos solicitudes con la misma apertura.
- `hoja-milimetrada.component.ts` y `.html`: boton/evento y espacio para la nueva accion contextual, sin modificar calculos ni datos.
- `map-actions.service.ts`: tercera accion del menu compartido.
- `map-context-menu.spec.ts`: el menu pasa de dos a tres opciones.

No se modifica el menu interno de Sistemas, estilos de los menus contextuales, renderizado cartografico, coordenadas, proyecciones, fijacion ni endpoints.

## Verificacion

15 pruebas aprobadas en tres suites: nueva ventana, Menu y menus contextuales/proyeccion. Cubren los ocho bordes, limites de movimiento, geometria conservada, minimizacion/maximizacion, cierre/reapertura, unica instancia desde ambos origenes, ausencia de derivacion a Proyectar y z-index compartido.

Compilacion de desarrollo correcta. Produccion no presenta errores Angular derivados de la integracion, pero mantiene el error previo de presupuesto CSS de Hoja Milimetrada: 19,26 kB frente a 18 kB. No se modifica su CSS ni el presupuesto.

Las verificaciones son automatizadas con Angular/jsdom; queda pendiente una comprobacion visual manual en navegador de los menus y fullscreen. No se realizaron peticiones a proveedores de mapas para esta tarea ni se implementa logica operacional de limites de seguridad.
