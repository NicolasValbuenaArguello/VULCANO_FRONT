# Presentacion del formulario de coordenadas

El formulario identificado es `.limits-coord-grid` en
`src/app/pages/vulcano/ventana-limites-seguridad/ventana-limites-seguridad.html`.
Solo se modifica su hoja `ventana-limites-seguridad.css`; HTML, TypeScript,
eventos, bindings, tipos, valores, conversiones y validaciones se conservan.

## Ajustes CSS

- Reparto exterior 56/44 en lugar de 48/52: el panel del formulario gana aproximadamente 16,7% del ancho relativo disponible. La ventana conserva sus dimensiones y el visor usa el espacio restante.
- Las dos filas comparten cinco columnas, con mayor proporcion para segundos y decimal, y separacion de 6px horizontal / 8px vertical.
- Solo los controles dentro de `.limits-coord-grid` reciben altura de 36px, fuente de 13px, numeros tabulares, padding uniforme y borde verde. Nombre y controles de estilo conservan sus reglas.
- Encabezados de 10px con mejor contraste y alineacion centrada; foco dorado con contorno separado y halo discreto.
- Se ocultan las flechas visuales nativas de los inputs numericos para aprovechar su ancho; no cambia type=number ni sus eventos, limites o manejo de teclado.
- La consulta de contenedor exterior cambia de 700px a 820px para evitar recortes al comprimir ambas columnas.
- Hasta 460px, la cuadricula se transpone: encabezados a la izquierda, latitud y longitud en columnas paralelas, manteniendo los mismos cinco encabezados. Fuente de 12px y padding horizontal de 4px. El DOM y su orden de Tab no cambian; los aria-label existentes distinguen latitud y longitud. Esta adaptacion evita comprimir cinco controles en una sola fila estrecha.

## Comprobaciones realizadas

- `npx ng build --configuration development`: correcto; persiste el aviso NG8113 anterior de VentanaLimitesSeguridad no utilizada en el template de Vulcano.
- Chrome headless con HTML de la cuadricula real y hojas de estilo reales, sobre una pagina estatica de comprobacion y valores sinteticos. No representa una prueba autenticada end-to-end ni valida comportamiento Angular.
- 17 anchos de ventana entre 320 y 1920px, incluidos los limites de cambio de distribucion: controles contenidos, sin solapamientos, alturas uniformes y texto de muestra sin recorte medido con su fuente. Se usaron valores largos como `59.999999` y `-180.000000`. No garantiza cabida de un numero arbitrariamente largo.
- Captura de la distribucion a 850px inspeccionada visualmente. Evidencia: [captura](previews/coordinate-form.png) y [mediciones](previews/coordinate-form-checks.json).
- No se agregan pruebas de logica para este cambio exclusivamente CSS. No se modifican otros formularios ni se ejecutan calculos.

La compilacion de produccion no se repitio en esta tarea visual; la ejecucion anterior documentada en `persistencia-sesion-diagnostico.md` falla por el presupuesto CSS de hoja-milimetrada.component.css (19,26kB frente a 18kB), que no se modifica aqui.
