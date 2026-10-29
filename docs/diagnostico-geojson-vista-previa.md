# Diagnostico: validacion, GeoJSON y vista previa del editor

## Causa y comportamiento anterior

VentanaLimitesSeguridad.graficar() solo llamaba geometriaValida() y asignaba VISTA PREVIA LOCAL ACTUALIZADA. No validaba el nombre ni ejecutaba generarGeoJSON(). El SVG ya se recalculaba por bindings al agregar/editar vertices y estilos. Por tanto, pulsar el boton no significaba publicar geometria en un mapa ni persistirla.

La simplificacion anterior retiro las llamadas del editor al archivo GIS y a la descarga local, conservando generarGeoJSON y el validador. No se encontro eliminacion de funciones compartidas: PoligonosGisService, modelos y pagina GIS independiente siguen disponibles y sus pruebas se ejecutan en esta validacion.

## Cambio implementado

- graficar() delega validacion y construccion a generarGeoJSON(), sin duplicar logica ni realizar HTTP.
- Se exige nombre no vacio, al menos tres vertices distintos, coordenadas numericas finitas en rangos geograficos, anillo simple sin cruces/contactos/segmentos superpuestos/degeneracion y estilo valido.
- El resultado es un Feature GeoJSON en memoria cuya geometry es Polygon: coordinates usa [longitud,latitud], anillo cerrado una sola vez y vertices editables sin duplicar el primero. properties conserva nombre recortado, descripcion opcional y copia del estilo. WGS84 es el sistema geografico implicito de GeoJSON; no se agrega un CRS no estandar.
- Se conserva el rechazo explicito de geometria que requiere corte del antimeridiano; no se simula soporte de MultiPolygon o de superficies globales.

Estados publicos de la ultima comprobacion:

| Propiedad | Valores | Alcance |
|---|---|---|
| estadoGeometria | pendiente / validada / invalida | Resultado topologico del borrador |
| estadoGeoJSON | pendiente / generado | Construccion real de un Feature valido |
| estadoVistaPrevia | pendiente / actualizada | Confirmacion local posterior al render SVG |
| geoJSONGenerado | Feature o null | Resultado actual generado en memoria, sin persistencia |

La geometria puede estar validada aunque el estilo sea invalido: en ese caso no se genera GeoJSON ni se anuncia exito SVG. Los fallos de nombre, cantidad de vertices o geometria tienen mensajes especificos.

Despues de generar el Feature, graficar() registra afterNextRender con el inyector del componente. Solo confirma VISTA PREVIA SVG ACTUALIZADA cuando existe el polygon del dialogo y sus points coinciden con la proyeccion esperada. Antes indica SVG PENDIENTE. El mensaje final enumera GEOMETRIA VALIDADA, GEOJSON GENERADO EN MEMORIA y VISTA PREVIA SVG ACTUALIZADA; termina con SIN ENVIO A MAPAS.

Los cambios confirmados de vertices, nombre o estilo invalidan el resultado anterior. Un contador de revision impide que un callback de un borrador viejo anuncie exito sobre otro borrador. Los cambios de campos DMS no comprometidos aun no alteran el vertice guardado; se validan al agregar/actualizar. Se conserva la actualizacion automatica del SVG mientras se edita: el boton comprueba/genera/confirma, no publica capas.

## Archivos modificados

- src/app/pages/vulcano/ventana-limites-seguridad/ventana-limites-seguridad.ts: estados explicitos, resultado GeoJSON, invalidacion y confirmacion post-render. Funciones documentadas.
- Su HTML: ngModelChange en nombre/estilo para invalidar comprobaciones obsoletas. No cambia distribucion, colores, SVG ni controles de ventana.
- Su spec.ts: mensajes especificos, etapas completadas, resultado GeoJSON, invalidacion, callback obsoleto y ausencia de HTTP.
- Este informe.

No se modifican servicios de mapas, calculos de elevacion, componentes operativos, backend, configuracion HTTP global, FloatingWindowBase ni WindowManagerService.

## Investigacion separada de HTTP 400 de elevacion

Se revisaron, sin modificar, ApiConfigService/VulcanoApiService, el proxy y los consumidores de elevacion. elevationUrl(lat,lon) construye la consulta con URLSearchParams y claves lat/lon; /api/vulcano se elimina en el proxy de desarrollo antes de llegar al backend. El OpenAPI local publica GET /dem/elevacion con parametros numericos lat/lon. Su esquema enumera 200/422, pero esto no excluye errores propios del servicio DEM.

Consultas de solo lectura al backend local 127.0.0.1:8010 durante este diagnostico:

| Consulta | Resultado |
|---|---|
| GET /dem/health | 200 |
| GET /dem/info | 200 |
| GET /dem/elevacion?lat=0&lon=0 | 400, detail: La coordenada esta fuera de la cobertura del DEM |

La coordenada 0,0 es sintetica y no procede del poligono del usuario. Esta prueba confirma una causa concreta de 400 (fuera de cobertura) y demuestra que el servidor DEM responde; NO demuestra que todos los errores observados por el usuario tengan esa misma causa. Para identificar cada caso original falta la URL y el detail exactos de esa solicitud en Network. No se muestrean elevaciones de puntos operativos ni se modifican coberturas, valores o calculos.

El editor no inyecta HttpClient/VulcanoApiService y el test del boton verifica cero solicitudes: estos 400 no son un resultado de la generacion GeoJSON local. No se afirma que el problema de elevacion este resuelto.

## Investigacion separada de NG02814

Causa confirmada en la version instalada, no inferida de otra version Angular:

- node_modules/@angular/common/fesm2022/_module-chunk.mjs, validateXhrCompatibility(): la opcion cache se asocia a errorCode 2814 y advierte que XHR no la admite; el texto indica withFetch() como alternativa.
- src/app/app.config.ts registra provideHttpClient(withInterceptors(...)) sin withFetch().
- auth.interceptor.ts clona solicitudes al backend con cache:'no-store'; VulcanoApiService.getResource tambien lo declara.

NG02814 avisa que esa opcion no se aplica en el transporte XHR. No es una respuesta HTTP y no convierte por si misma una respuesta en 400. El 400 de la prueba anterior lo emite el backend por cobertura; ambos diagnosticos son independientes del SVG.

Una correccion global futura debe decidir entre habilitar Fetch en provideHttpClient o retirar/adaptar opciones exclusivas del transporte, revisando compatibilidad, cache efectivo y comportamiento HTTP. No se aplica ninguna de esas alternativas aqui: la solicitud actual exige investigar por separado y conservar los servicios y componentes operativos. El aviso permanece pendiente de una correccion de alcance global, no se oculta ni se declara resuelto.

## Integraciones existentes y pendientes

Existe: edicion local DMS/DD, vertices, estilo, validacion geometrica, Feature GeoJSON en memoria y vista SVG del dialogo. La proyeccion del SVG es una aproximacion local para vista previa; no realiza mediciones geodesicas ni prueba renderizado cartografico externo.

Pendiente en esta ventana: publicar una capa en cualquier visor GIS, guardar/enviar el Feature, sincronizar estado con un backend y recibir confirmacion de un motor cartografico. La pagina GIS independiente y su CRUD compartido siguen separados; generar un Feature no los actualiza automaticamente. No se implementan integraciones operativas.

## Validacion

Se ejecutan las pruebas del editor y las pruebas de los servicios/visores compartidos para comprobar que permanecen disponibles. Cubren nombre faltante, cantidad insuficiente, coordenadas/contorno invalidos, estilo invalido, orden lon/lat, cierre, metadatos, etapas, invalidacion por cambios y ausencia de HTTP. Las regresiones de ventana, DMS, edicion, eliminacion y estilo se conservan.

Resultados: 32 pruebas aprobadas en tres archivos (21 del editor/ventana y 11 de servicios/visores compartidos). Compilacion de desarrollo correcta; compilacion de produccion bloqueada exclusivamente por el presupuesto CSS preexistente de hoja-milimetrada.component.css (19.26 kB frente a 18 kB). No se modifica ese archivo ni su presupuesto.
