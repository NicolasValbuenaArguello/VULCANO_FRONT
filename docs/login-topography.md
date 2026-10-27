# Fondo topografico del login

Se agrega `shared/components/topography-background/` con TS, HTML, CSS, shaders/configuracion y prueba de ciclo de vida. `login.component.ts` importa el standalone y la configuracion; su HTML sustituye el fondo decorativo anterior y su CSS explicita el orden de capas. Los servicios de autenticacion, rutas, formulario y mapas operacionales no cambian.

La especificacion adjunta no contenia el codigo fuente completo indicado. Se consulto como referencia visual/tecnica Topography de React Bits: https://github.com/DavidHDev/react-bits/blob/main/src/content/Backgrounds/Topography/Topography.jsx. Esta implementacion escribe shaders propios para Angular/WebGL2; no es un port literal ni reproduce todas las pasadas, herramientas y efectos opcionales del original.

## Renderizado

- Un contexto WebGL2 de bajo consumo, sin React, librerias adicionales ni descargas.
- Una malla procedural de 128 x 128 celdas generada con `gl_VertexID`, relieve de cuatro octavas y camara inclinada en el vertex shader.
- Fragment shader con curvas antialias mediante derivadas, luz sobre normales, halo oliva, suavizado lejano y niebla. La profundidad de campo es una aproximacion de suavizado de lineas dependiente de distancia, no un postproceso optico completo.
- Configuracion inicial exacta del pedido en `DEFAULT_TOPOGRAPHY_CONFIG`; el login la pasa mediante `[config]`. Solo datos decorativos, no DEM real.
- Hover eleva el relieve y el clic genera un pulso radial. Los listeners pasivos del contenedor no previenen eventos ni capturan el puntero. Inputs, formulario, botones y enlaces se excluyen. El canvas no recibe foco ni intercepta interacciones.

## Rendimiento y ciclo de vida

El componente registra observadores y eventos fuera de Angular. Mantiene un unico requestAnimationFrame y limita el dibujo a 30 FPS. Limita DPR a 1/1,5 y superficie a 700.000/1.300.000 pixeles segun hardwareConcurrency y tamano. Esto es un presupuesto conservador, no un benchmark de la GPU.

`visibilitychange` pausa y evita saltos al reanudar. `prefers-reduced-motion` cancela el bucle y muestra una imagen WebGL estatica; cambios de preferencia se aplican en ejecucion. ResizeObserver reajusta el buffer sin cambiar dimensiones CSS. Ante fallo de contexto/compilacion permanece el gradiente CSS; no se simula una animacion alternativa.

La perdida de contexto cancela RAF y descarta referencias invalidadas; al restaurarlo se recompilan recursos en el mismo contexto. Al destruirse el componente se cancelan RAF, listeners y ResizeObserver, se liberan programa/VAO y se solicita perder el contexto si la extension esta disponible. No hay texturas, buffers de malla ni ciclos secundarios.

## Validacion

- Compilacion de desarrollo correcta.
- Cuatro pruebas aprobadas: envio y reintento de login existente, limpieza de recursos, movimiento reducido/restauracion y fallback sin WebGL2.
- Chrome headless con SwiftShader: programa enlazado, dibujo con `gl.getError() === 0`, eventos hover/pulso activos, formulario accesible, RAF detenido con movimiento reducido, contexto restaurado sin error y referencias liberadas en cleanup. El rendimiento de una GPU fisica queda pendiente; SwiftShader es renderizado por software.
- Se inspeccionaron capturas de bienvenida y formulario. No se realizo inicio de sesion real contra el backend; la prueba HTTP de autenticacion usa su mock existente.
- Produccion mantiene el error previo del presupuesto CSS de Hoja Milimetrada (19,26 kB frente a 18 kB). No se modifica ese archivo ni el presupuesto.
