# Distribucion de la ventana del editor local

Se modifica exclusivamente la maquetacion de ventana-limites-seguridad.html y ventana-limites-seguridad.css. El TypeScript, SVG, servicios, transformaciones y manejadores de ventana permanecen sin cambios en esta tarea.

## Causa y correccion

El overflow:auto heredado de menu.css y la altura calc(100% - 42px) del contenido competian con el pie. Ademas, el minimo de 310px del visor y los minimos de las columnas impedian reducir correctamente la ventana.

La cabecera y el pie tienen flex:0 0 auto. El contenido ocupa el resto con flex:1 1 0 y min-height:0; el area central usa columnas minmax(0,48fr)/minmax(0,52fr), descontando la separacion de 12px. El formulario tiene scroll vertical propio y la tabla conserva su scroll interno. El visor usa el espacio flexible y su SVG se contiene con posicion absoluta, conservando viewBox y preserveAspectRatio.

Una consulta de contenedor de 700px responde al ancho de la propia ventana, no al ancho del navegador. En una columna se desplaza el area central completa para acceder tanto al formulario como al visor; el pie permanece fuera de ese scroll. El contenedor del dialogo ya recorta su borde por diseno heredado: no se usa ese recorte como sustituto del scroll accesible.

Se retira el boton duplicado Agregar punto del pie. Quedan Limpiar vertices, Graficar y Guardar poligono, con sus mismos eventos, altura uniforme y clases visuales existentes (muted, azul y dorado). Agregar/Actualizar permanece en Coordenadas.

## Validacion

- 18 pruebas del componente aprobadas, incluidas regresiones de minimizar, maximizar/restaurar, cerrar y resize.
- npx ng build --configuration development: correcto.
- Comprobacion de layout en Chrome headless mediante una pagina de prueba que reutiliza estructura y CSS reales, con 20 filas sinteticas. No es una sesion autenticada ni una prueba end-to-end de la aplicacion.
- Tamanos: 850x550, 1100x700, 1920x1080 (aproximacion maximizada), 420x550, 420x300 y 680x550. Pie, visor y botones contenidos; sin overflow horizontal en los contenedores inspeccionados. Dos columnas en los tres primeros; una columna en anchos reducidos.
- Evidencia numerica: previews/limites-layout-checks.json. Las pruebas Angular verifican comportamiento del componente; la prueba Chrome verifica su maquetacion con datos sinteticos.

- npx ng build: bloqueado exclusivamente por el presupuesto CSS preexistente de hoja-milimetrada.component.css (19.26 kB frente a 18 kB). No se modifica ese archivo ni los presupuestos.
