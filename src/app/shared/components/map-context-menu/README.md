# Acciones contextuales de mapas

Los visores mantienen sus motores y proveedores originales. Leaflet entrega
`event.latlng`; MapLibre verifica `transform.isPointOnMapSurface(point, terrain)`
y utiliza `unproject(point)`, que incorpora el terreno activo. Se rechazan puntos
no finitos, fuera de rango y clics sobre el cielo. Solo se normaliza longitud
cuando corresponde a una copia del mundo fuera de [-180, 180].

`MapActionsService` conserva un unico punto temporal y un unico menu DOM compartido.
El menu se monta dentro del visor, con coordenadas de pantalla utilizadas solo
para posicionarlo. Emitir una accion no confirma ni persiste elementos. Sus
listeners se retiran al cerrar; no interviene en los gestos de rotacion y evita
controles, marcadores y dialogos. Cambiar de vista o mover la camara cierra el menu.

`Vulcano` recibe las acciones mediante una suscripcion ligada a DestroyRef.
GRAFICAR llama al `Menu.openGraficarWindow` original y proporciona una precarga al
mismo `Graficar`. Se cambian exclusivamente las coordenadas; se conservan los
demas campos. La representacion DMS mantiene el valor decimal seleccionado.

PROYECTAR llama a la unica Hoja ya montada. El origen temporal no se agrega a
registros ni marcadores. Se reutilizan el modal, las validaciones, la formula y
la solicitud de confirmacion existentes. Un modal abierto conserva sus parametros
al cambiar de origen. `MapActionPortalDirective` mueve sus mismos nodos al visor
solicitante o al elemento fullscreen y los elimina cuando Angular cierra esa vista.
Las variables visuales se heredan del formulario original antes del traslado.

No se agregan formularios, componentes de proyeccion, endpoints ni librerias.
Los controles de cada ventana mantienen las capacidades que tenian previamente.
