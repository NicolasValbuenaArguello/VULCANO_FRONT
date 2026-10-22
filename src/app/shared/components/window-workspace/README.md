# Ventanas persistentes de la Hoja Milimetrada

`WindowManagerService` se provee en cada `HojaMilimetradaComponent`. Solo administra
identidad, modo, orden, posicion, dimensiones y visibilidad; los datos y calculos
siguen perteneciendo a la Hoja y sus servicios originales.

`FloatingPanelDirective` conserva el elemento y los nodos Angular originales.
Al flotar, los traslada a `WindowWorkspaceComponent`; al integrar o cerrar, los
devuelve a un comentario ancla en su posicion original. No crea componentes,
vistas, formularios, suscripciones a datos ni solicitudes HTTP adicionales.
Minimizar usa `hidden` e `inert`, sin eliminar contenido. Maximizar utiliza las
dimensiones del area disponible y conserva el rectangulo normal para restaurarlo.

El espacio de ventanas esta dentro de `#hojaCompleta`, por lo que participa de la
misma Fullscreen API sin overlays en `document.body`. ResizeObserver ajusta los
limites y reserva el espacio de los controles inferiores. El acceso «PANELES»,
despues de CURVAS AUTO en la barra inferior, conserva el menu nativo details y
reutiliza `activate` en vista normal y fullscreen. Permite recuperar los paneles
integrados sin duplicar sus instancias. El propio atributo `open` controla las
flechas de apertura, sin agregar otro estado al administrador.

Se utilizan Pointer Events y captura de puntero, como en las ventanas existentes
del menu. Angular CDK no esta instalado y esta implementacion no agrega paquetes.
El arrastre se agrupa con requestAnimationFrame; todos los listeners temporales
y observadores se liberan al integrar o destruir. Los SVG conservan sus viewBox
y los algoritmos existentes; el contenido tiene desplazamiento interno.

Para incorporar otro panel, agregar `appFloatingPanel="identificador-unico"` y
`windowTitle="Titulo"` al elemento existente, dentro de una Hoja con un workspace.
Opcionalmente configurar `windowMinWidth` y `windowMinHeight`. No aplicar la
directiva a la propia Hoja, que es el espacio de trabajo de las demas ventanas.
