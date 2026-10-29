> Actualizacion: la ventana de edicion fue simplificada y ya no consume el CRUD ni ofrece exportacion/archivo GIS. El servicio y la pagina independiente se conservan. Ver docs/simplificacion-editor-poligonos.md. Las secciones sobre controles de archivo del editor describen la integracion anterior.

# Integracion GIS de poligonos

## Alcance y arquitectura

Implementacion independiente de proposito general. No publica capas en mapas operacionales ni utiliza calculos, coordenadas persistidas o servicios de otros modulos. Conserva FloatingWindowBase, WindowManagerService, conversion DMS, vertices editables, vista SVG y exportacion GeoJSON local.

La revision del repositorio encontro un ejemplo FastAPI con JSON en demos/local-points/backend/main.py. El OpenAPI consultado en 127.0.0.1:8010 no publica CRUD de poligonos. Por eso se implementa un NUEVO servicio FastAPI separado en demos/gis-polygons/backend/main.py; no se presume que sus rutas ya existan en el backend principal y no se modifica ese servidor.

Flujo: editor Angular -> validar/serializar -> PoligonosGisService -> proxy /api/gis -> FastAPI GIS en loopback 8026 -> archivo propio. El visor /gis-poligonos consulta el mismo servicio y mantiene motores Leaflet y MapLibre propios de esa pagina. Las representaciones se derivan de los registros consultados, no de copias independientes editables de los vertices.

La ruta Angular es hija del AppShell y conserva su authGuard existente. La API GIS local no implementa autenticacion/autorizacion de produccion: no recibe los JWT del backend principal. Se ejecuta en loopback para desarrollo; antes de exponerla por red debe integrarse autorizacion en un gateway/backend definido para GIS, sin reutilizar credenciales arbitrariamente. El guard del frontend no protege por si mismo la API.

## Archivos

### Creados

- demos/gis-polygons/backend/main.py: modelos Pydantic, validacion GEOS/Shapely, almacen atomico y CRUD.
- demos/gis-polygons/backend/requirements.txt: dependencias Python. Shapely se justifica para validacion topologica robusta; ya estaba instalado en el entorno de verificacion. httpx se utiliza en las pruebas. Sin dependencias npm nuevas.
- demos/gis-polygons/backend/test_main.py: validacion, CRUD, concurrencia, corrupcion y fallos de escritura.
- demos/gis-polygons/backend/test_restart.py: dos procesos reales Uvicorn y consulta HTTP despues del reinicio.
- src/app/shared/gis-polygons/poligono.model.ts: contrato TypeScript compartido.
- src/app/shared/gis-polygons/poligonos-gis.service.ts y .spec.ts: CRUD HTTP, If-Match, timeout y mensajes seguros.
- src/app/pages/gis-poligonos/gis-poligonos.ts y .spec.ts: pagina GIS, adaptadores 2D/3D independientes, visibilidad, nombres, vertices y centrado.
- docs/previews/gis-independiente.png y gis-independiente-checks.json: evidencia grafica y numerica con datos sinteticos.
- Este documento.

### Modificados

- src/app/pages/vulcano/ventana-limites-seguridad/ventana-limites-seguridad.ts: reutiliza modelo de estilo, agrega consulta/carga/crear/actualizar/borrar, estado de operacion y confirmaciones. Refresca la lista despues de mutaciones y conserva borrador ante conflicto. Marca deteccion de cambios tras operaciones asincronas, compatible con Angular sin Zone.js.
- Su .html: panel de archivo GIS, descripcion, consultar, cargar/eliminar, nuevo registro y acceso al visor. El boton dorado guarda en el servicio; Exportar GeoJSON conserva la descarga local. Los controles de ventana no cambian. No se modifica el CSS en esta tarea.
- Su .spec.ts: dependencia RouterLink configurada y regresiones de guardado/carga/borrado/conflicto.
- src/environments/environment.shared.ts: gisPoligonosUrl='/api/gis/poligonos'.
- proxy.conf.cjs: /api/gis/** a 127.0.0.1:8026 sin eliminar prefijo. No cambia proxies de otros modulos.
- src/app/app.routes.ts: nueva ruta /gis-poligonos dentro de la zona autenticada; no cambia rutas existentes ni menus.
- .gitignore: excluye datos y __pycache__ del nuevo backend.

## Arranque

Desde la raiz, usando el entorno Python destinado a este servicio:

```powershell
python -m pip install -r demos/gis-polygons/backend/requirements.txt
python -m uvicorn main:app --app-dir demos/gis-polygons/backend --host 127.0.0.1 --port 8026
```

Instalar requirements solo si el entorno aun no tiene esas dependencias; durante esta implementacion no se instalaron paquetes. El OpenAPI del nuevo servicio queda en http://127.0.0.1:8026/openapi.json y su Swagger UI en /docs.

En otra terminal iniciar/reiniciar ng serve para cargar el proxy:

```powershell
npm start
```

Iniciar sesion normalmente en Angular. En el editor: crear vertices, guardar con el boton dorado, consultar lista y cargar/editar. NUEVO REGISTRO desvincula el ID sin borrar el borrador: el siguiente guardado crea otra identidad. Cargar solicita confirmacion para reemplazar el borrador. Eliminar solicita confirmacion y conserva los vertices locales, pero retira su identidad guardada. EXPORTAR GEOJSON no envia HTTP.

El boton VISOR GIS INDEPENDIENTE navega a /gis-poligonos; guardar antes de salir del editor, porque su borrador sigue siendo en memoria. No se abre una segunda sesion o mapa operacional.

## Modelo y validacion

Entrada (JSON):

```json
{
  "nombre": "Poligono GIS de prueba",
  "descripcion": "Ejemplo sintetico de proposito general",
  "vertices": [
    {"latitud": 0, "longitud": 0},
    {"latitud": 0, "longitud": 1},
    {"latitud": 1, "longitud": 0}
  ],
  "geometria": {
    "type": "Polygon",
    "coordinates": [[[0,0],[1,0],[0,1],[0,0]]]
  },
  "srid": 4326,
  "estilo": {
    "colorRelleno": "#3498db",
    "colorLinea": "#ffffff",
    "opacidadRelleno": 0.65,
    "opacidadLinea": 1,
    "grosorLinea": 2.5
  }
}
```

El servidor agrega id UUID, fecha_creacion UTC, fecha_actualizacion UTC y version entera desde 1. Ejemplo ilustrativo de los campos adicionales, generados por el servidor, no valores a enviar:

```json
{
  "id": "00000000-0000-4000-8000-000000000001",
  "fecha_creacion": "2026-10-27T00:00:00Z",
  "fecha_actualizacion": "2026-10-27T00:00:00Z",
  "version": 1
}
```

La respuesta completa conserva todos los campos de entrada ademas de esos cuatro campos. El listado devuelve un arreglo de esos registros; POST/GET por ID/PUT devuelven un registro; DELETE no devuelve cuerpo.

- Orden GeoJSON siempre longitud, latitud. Anillo cerrado exactamente una vez y coherente con la lista editable abierta, en su mismo orden.
- Minimo 3 y maximo 5000 vertices; sin coordenadas repetidas, NaN/Infinity o fuera de latitud +/-90 y longitud +/-180.
- GEOS/Shapely valida area no nula, cruces y topologia; esta comprobacion es del servidor, independiente de la validacion existente del editor.
- Un solo anillo exterior, sin huecos. Poligonos que requieren corte del antimeridiano se rechazan y deben dividirse previamente. No se implementa MultiPolygon.
- Nombre obligatorio, maximo 150 caracteres; descripcion hasta 2000. Colores #RRGGBB, opacidades entre 0 y 1, grosor mayor que 0 y hasta 64.
- srid solo 4326. No se agregan campos CRS no estandar al objeto GeoJSON. La exportacion local sigue siendo Feature; la API persiste geometria Polygon y metadatos separados.

## Endpoints implementados en el NUEVO servicio

| Metodo | Ruta | Entrada | Exito | Errores |
|---|---|---|---|---|
| POST | /api/gis/poligonos | Entrada JSON | 201 Registro, ETag "1" | 422 validacion; 500 almacenamiento |
| GET | /api/gis/poligonos | Ninguna | 200 Registro[] | 500 almacenamiento |
| GET | /api/gis/poligonos/{id} | UUID | 200 Registro y ETag de version | 404 inexistente; 422 UUID; 500 |
| PUT | /api/gis/poligonos/{id} | Entrada completa e If-Match | 200 Registro con version incrementada y ETag | 409 version obsoleta; 404; 422; 500 |
| DELETE | /api/gis/poligonos/{id} | If-Match | 204 sin cuerpo | 409 version obsoleta; 404; 422; 500 |

Ejemplo PowerShell, reutilizando el JSON anterior en $json:

```powershell
$registro = Invoke-RestMethod http://127.0.0.1:8026/api/gis/poligonos -Method Post -ContentType 'application/json' -Body $json
Invoke-RestMethod http://127.0.0.1:8026/api/gis/poligonos
Invoke-RestMethod ("http://127.0.0.1:8026/api/gis/poligonos/" + $registro.id)
$headers = @{ 'If-Match' = '"' + $registro.version + '"' }
$actualizado = Invoke-RestMethod ("http://127.0.0.1:8026/api/gis/poligonos/" + $registro.id) -Method Put -Headers $headers -ContentType 'application/json' -Body $json
$headers = @{ 'If-Match' = '"' + $actualizado.version + '"' }
Invoke-RestMethod ("http://127.0.0.1:8026/api/gis/poligonos/" + $registro.id) -Method Delete -Headers $headers
```

If-Match es obligatorio y contiene las comillas del ETag fuerte. Su ausencia genera 422; una version distinta genera 409. Angular envia ese encabezado desde registro.version. Ante conflicto no descarta el borrador ni actualiza silenciosamente la version: hay que consultar/cargar la version vigente y resolver la edicion.

## Persistencia y concurrencia

Por defecto: demos/gis-polygons/backend/data/poligonos.json, independiente de registros de coordenadas/puntos de otros modulos. GIS_POLYGONS_FILE permite otra ruta para este servicio. Archivo y cache Python quedan excluidos de Git.

La transaccion usa RLock por instancia y bloqueo lateral poligonos.lock entre procesos cooperantes (msvcrt en Windows, flock en POSIX). El bloqueo cubre lectura, comprobacion de version y escritura. Se escribe un temporal en el mismo directorio, flush/fsync y os.replace. El archivo lateral no se reemplaza para conservar una identidad estable de bloqueo.

La version evita actualizaciones/borrados perdidos entre clientes. Un archivo corrupto no se sustituye por uno vacio: devuelve 500. Una falla de reemplazo deja intacto el JSON previo. La carpeta debe ser escribible y el almacenamiento local debe soportar esos bloqueos/reemplazos; no se declara soporte de filesystem distribuido o recuperacion ante todos los escenarios de corte electrico. Para mayor volumen/multiples nodos corresponde migrar a una base de datos transaccional.

## Visualizacion

- Leaflet: geometria WGS84, relleno/contorno/opacidades/grosor, etiquetas seguras con textContent y vertices opcionales. Sin teselas externas.
- MapLibre: fuente GeoJSON y capas fill/line con estilo por registro, etiquetas y vertices mediante Marker. Vista inclinada con navegacion, sin DEM, extrusiones ni relieve; no se afirma un terreno 3D georreferenciado.
- Botones de visibilidad por registro y centrado geografico en ambos visores. Nombres/vertices se pueden activar o desactivar.
- Cada refresco reemplaza la capa Leaflet y actualiza la misma fuente MapLibre; no agrega nuevas capas repetidas. Marcadores anteriores se retiran.
- La pagina consulta al entrar. Actualizar lista y capas recupera ediciones o eliminaciones hechas por otros clientes. No hay push WebSocket, sondeo automatico o sincronizacion en tiempo real inventada. Al guardar/eliminar, el editor refresca automaticamente su propia lista.
- ngOnDestroy retira exclusivamente los motores de esta pagina. Las solicitudes usan takeUntilDestroyed. No modifica los motores/cartografia existentes ni la hoja milimetrada.

## Errores y confirmaciones

El cliente usa timeout y mensajes controlados para red/servidor, 404, 409 y 422; no presenta cuerpos arbitrarios del servidor. Tambien prepara mensajes 401/403 para un futuro gateway autorizado, sin afirmar autenticacion actual del servicio local. No adjunta JWT, API keys o refresh token del backend principal.

El boton de guardar bloquea solicitudes concurrentes de la ventana. Solo confirma guardado tras respuesta exitosa del servidor; si el refresco posterior falla, informa que el guardado si se confirmo pero la lista no se pudo actualizar. Fallos de red no se presentan como confirmacion. Cancelar la peticion del navegador no garantiza revertir una escritura que ya se haya confirmado en el servidor.

## Pruebas y verificacion

```powershell
python -m unittest discover -s demos/gis-polygons/backend -p 'test_*.py' -v
npm test -- --watch=false --include=src/app/shared/gis-polygons/*.spec.ts --include=src/app/pages/gis-poligonos/*.spec.ts --include=src/app/pages/vulcano/ventana-limites-seguridad/ventana-limites-seguridad.spec.ts
npx ng build --configuration development
npx ng build
```

Python: 9 pruebas aprobadas, incluidos CRUD, reabrir almacen, dos actualizaciones concurrentes (solo una exitosa), 12 creaciones concurrentes entre dos instancias, rechazo de corrupcion y fallo atomico. test_restart.py inicia Uvicorn en un puerto libre de loopback, crea un registro via HTTP, detiene ese proceso, inicia otro con el mismo archivo y comprueba identidad/contenido. Los procesos de prueba se detienen al terminar.

Angular: pruebas del servicio, manejo de errores, carga/guardado/borrado del editor, conflicto sin perdida del borrador y adaptadores con motores simulados (visibilidad, reemplazo de datos sin duplicacion, estilo, centrado y limpieza). Se conservan regresiones DMS/SVG/exportacion y de la ventana. Resultado final: 31 pruebas aprobadas en tres archivos; compilacion de desarrollo correcta. npx ng build de produccion sigue bloqueado por hoja-milimetrada.component.css (19.26 kB frente a 18 kB), sin errores nuevos TypeScript o de plantilla.

Chrome real: se monto una pagina temporal de prueba con el componente Angular GisPoligonos real y el FastAPI nuevo con datos sinteticos, sin autenticar contra el backend principal. Se confirmaron un poligono Leaflet, canvas WebGL, fuente GeoJSON procesada y features renderizadas de MapLibre. La primera captura con tiempo virtual no permitio comprobar la fuente; se repitio esperando renderizado real mediante CDP. Los features renderizados pueden aparecer en mas de un tile: ese conteo no equivale a entidades duplicadas. Se conserva captura y resumen JSON en docs/previews/gis-independiente*.

No se declara validada visualmente la navegacion completa autenticada ni un despliegue productivo. No se instalo ni reinicio el backend principal. El servicio de prueba no se deja ejecutando permanentemente: iniciar 8026 con el comando indicado.

## Pendientes / limites

- Autenticacion/autorizacion y publicacion segura del servicio GIS fuera de loopback; configuracion del reverse proxy en produccion.
- Integracion con PostgreSQL/PostGIS, si se requiere; esta entrega persiste JSON propio.
- DEM/terreno 3D, anillos interiores, MultiPolygon, corte automatico del antimeridiano y sincronizacion entre clientes en tiempo real.
- Resolver el presupuesto CSS preexistente de Hoja Milimetrada en tarea separada si la compilacion de produccion sigue bloqueada. No se altera ese modulo en esta implementacion.
