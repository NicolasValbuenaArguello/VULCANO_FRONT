# Responsive y componente Piezas

## Problemas encontrados

El plano topografico comenzaba delante de la camara, sin cubrir el primer plano visible. Ademas, su ancho fijo no correspondia al frustum de perspectiva. Agrandar el canvas no resolvia las zonas negras. Las pantallas de bienvenida/login utilizaban secciones absolutas que dificultaban el crecimiento natural del contenido; Home tenia textos pequenos y no utilizaba el fondo compartido.

`Piezas` ya existe en `src/app/pages/vulcano/pages_sistemas/piezas/`, exporta `Piezas` y usa `app-piezas`. Su contenido actual es la plantilla `piezas works!`; integrarlo no lo convierte en un modulo de negocio completo. No se modifica su TS, HTML o CSS.

## Cambios de esta fase

- `shared/components/topography-background/topography-shaders.ts`: plano extendido al primer plano, ancho creciente con profundidad/aspect ratio, distribucion cuadratica de celdas para dar detalle cerca de la camara y compensacion de inclinacion para situar el horizonte fuera del encuadre. Se conserva perspectiva real; no se estira la imagen del canvas.
- `shared/components/topography-background/topography-background.ts`: un Input de configuracion compartido permite tambien opacidad y detalle (64-192 celdas, acotado por dispositivo). Se conservan controles de DPR/pixeles, RAF unico, 30 FPS, pausa, movimiento reducido y recuperacion/liberacion WebGL. No se duplican motores.
- `pages/login/login.component.css`: fondo fijo al viewport, pantalla activa en flujo normal con altura minima y scroll natural, formulario de hasta 460 px, controles de 54 px, logo visible y paneles translucidos con desenfoque moderado. La bienvenida conserva todos los textos institucionales y distribuye tarjetas en tres/dos/una columnas segun espacio. Index es la bienvenida existente de `/login`, no se crea una ruta nueva.
- `pages/home/home.ts`, `.html`, `.css`: importa el mismo standalone con configuracion propia; fondo sticky en el scrollport existente y contenido por encima. Respeta el sidebar, conserva foro/chat y reorganiza paneles en movil. No agrega funcionalidades a los controles existentes de demostracion.
- `pages/vulcano/ventana-sistemas-artilleria/ventana-sistemas-artilleria.ts`, `.html`, `.css`: importa `Piezas` y lo muestra en `@case ('graficar-piezas')`. Los demas identificadores mantienen `@default` provisional. Contenedor flexible con scroll interno y ancho disponible, sin position fixed en el contenido.
- `ventana-sistemas-artilleria.spec.ts`: cubre seleccion real de Piezas, cambio a los cinco destinos provisionales, regreso sin duplicados y conservacion de la instancia al minimizar/restaurar/maximizar.

No se cambian AuthService, rutas, gestores de ventanas, funciones de arrastre/redimensionamiento ni mapas operacionales. Los logos y el contenido institucional permanecen. No se agregan dependencias ni se crean componentes de negocio nuevos.

## Integraciones futuras

En la ventana: importar el componente standalone en TS y en `imports`, agregar el `@case` correspondiente antes del `@default`. Mantener los identificadores de MENU_SISTEMAS y la comunicacion mediante `cambioMenu`; no usar Router para estas secciones. Puede utilizarse `@defer` dentro del caso cuando el componente real y su carga lo justifiquen. Cambiar de caso destruye el contenido anterior; minimizar/maximizar conservan la instancia del caso activo.

Para el fondo: pasar `[config]` con `DEFAULT_TOPOGRAPHY_CONFIG` y overrides de color, speed, tilt, lineCount, glow, opacity, hoverEffect, clickEffect y detail. Login y bienvenida comparten una instancia. Home crea su propia instancia unicamente al entrar en esa ruta y la libera al salir.

## Validaciones

- 20 pruebas aprobadas en seis suites: login, Home, fondo WebGL, menu principal, menu de Sistemas y ventana con Piezas. jsdom no implementa WebGL real: se usa el navegador para los shaders.
- Compilacion de desarrollo correcta. Produccion sigue bloqueada exclusivamente por el presupuesto CSS existente de Hoja Milimetrada (19,26 kB frente a 18 kB). No se altera ese archivo ni su presupuesto; los estilos nuevos no generan errores adicionales de presupuesto.
- Chrome headless con SwiftShader: 18 escenarios (tres pantallas por seis resoluciones): 1920x1080, 1600x900, 1366x768, 1280x720, 768x1024 y 390x844.
- Se muestrearon pixeles del canvas despues del dibujo: hay curvas en las tres franjas verticales en todos los escenarios, incluyendo la inferior. Un programa WebGL activo, `gl.getError() === 0`, un unico fondo y ausencia de overflow horizontal de la pagina en todos ellos. Los valores no equivalen a un benchmark en GPU fisica.
- En escritorio el formulario mide 460 px; en movil se ajusta al espacio. En movil se verificaron inputs, cambio de password a texto, boton habilitado tras datos validos y acceso al boton mediante scroll. No se enviaron credenciales al backend.
- En Home movil, tras desplazar 1632 px el contenedor del fondo mantuvo su posicion respecto al viewport y el footer quedo accesible. No se corta ni duplica el fondo al bajar.
- Navegacion Home -> login: renderer anterior destruido, RAF cero y programa liberado; queda una sola instancia nueva. La sesion usada para visualizar Home fue simulada exclusivamente en el navegador de prueba, no se cambiaron guards ni credenciales del proyecto.

Resultados numericos: [previews/responsive-checks.json](previews/responsive-checks.json).

Capturas:

- [Index escritorio](previews/index-1920.png) / [movil](previews/index-390.png)
- [Login escritorio](previews/login-1920.png) / [movil](previews/login-390.png)
- [Home escritorio](previews/home-1920.png) / [movil](previews/home-390.png)

No se recibieron imagenes nuevas junto a los adjuntos de esta fase; el diseno sigue la especificacion textual y se inspecciono con las capturas generadas localmente.
