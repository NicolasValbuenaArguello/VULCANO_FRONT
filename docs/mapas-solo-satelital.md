# Modo temporal: solo Satelital

La configuracion `externalCartographyConfig()` conserva los cinco proveedores y agrega `enabled` en cada definicion: Satelital true; Calles, Topografico, Claro y Oscuro false. El token existente `CARTOGRAPHY_CONFIG` permite reactivarlos por despliegue sin modificar los motores.

## Implementacion

- `shared/models/cartography.model.ts`: propiedad obligatoria `RasterBaseMap.enabled`.
- `shared/services/cartography-config.service.ts`: politica central y `resolveSelection()` para descartar una seleccion previa deshabilitada. Actualmente no se encontro persistencia de la capa base en localStorage. La seleccion en memoria se normaliza antes de construir el mapa.
- `shared/components/mapa/mapa.ts`: solo crea `L.TileLayer` para capas habilitadas. Las cuatro opciones restantes usan entradas vacias de control, sin URL ni TileLayer; sus radios estan deshabilitados, tambien tras abrir el panel o cambiar zoom. No cambia overlays, marcadores ni herramientas.
- `pages/vulcano/mapa-tres-d/mapa-tres-d.ts`: seleccion inicial resuelta centralmente, radios nativos disabled y guardia en `changeBaseMap()` contra llamadas programaticas. Los estilos iniciales, de control y baseline usan la fuente habilitada. La sonda OSM no se ejecuta mientras Calles este deshabilitada. Se conservan nombres internos historicos como `osm` para no alterar dependencias del diagnostico; su fuente base pasa a ser satelital. Las fuentes DEM no cambian.
- `pages/terrain-minimal-test/terrain-minimal-test.ts`: su fondo cartografico tambien respeta la seleccion central; no modifica algoritmos de terreno.
- `shared/components/map-layers/map-layers.css`: solo agrega menor opacidad y cursor deshabilitado; mantiene colores, geometria, iconos y estructura.
- Tests de configuracion, controles y MapLibre actualizados para validar la politica temporal. El test de fuente propia activa Calles explicitamente en una configuracion aislada de pruebas; no la habilita en la aplicacion.

## Proveedor activo y autorizacion pendiente

Se conserva Esri World Imagery: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`. La URL actual no incluye API key/token. No se ha sustituido el proveedor ni solicitado una clave.

El repositorio no acredita licencia institucional para este uso. Las consultas de metadatos no permitieron verificar autorizacion o disponibilidad; tampoco se descargaron teselas, conforme a la restriccion del pedido. Se solicito confirmacion al usuario. No se declara verificado el derecho de uso ni funcionamiento real sin clave. Antes de ponerlo en servicio debe confirmarse el acuerdo Esri aplicable y efectuar una prueba visual autorizada desde la red real. La documentacion de los servicios Esri autenticados actuales no prueba por si sola los permisos de este endpoint legacy: https://developers.arcgis.com/documentation/security-and-authentication/.

## Verificacion

- Seis suites seleccionadas: 42 pruebas aprobadas, incluyendo configuracion, ambos mapas, selector, mediciones y loader/simulacion.
- Suite final de MapLibre: 4 pruebas aprobadas, incluyendo la nueva comprobacion de estilo inicial satelital, diagnostico satelital y bloqueo de llamadas programaticas. Las otras cinco suites no cambiaron tras su validacion anterior.
- Se comprueba por construccion de fuentes y mocks que no se generan URLs/cambios de fuente para opciones deshabilitadas; la sonda OSM no llama a fetch. No equivale a una captura real de trafico del navegador.
- Compilacion de desarrollo correcta. Produccion mantiene el fallo ajeno al cambio por CSS de Hoja Milimetrada: 19,26 kB frente al limite de 18 kB. No se modifica su presupuesto.
- Pendiente prueba manual autorizada: cargar 2D/3D con Network abierto, comprobar Satelital marcado, otras opciones bloqueadas, navegar y probar herramientas; filtrar peticiones OSM/OpenTopoMap/CARTO y confirmar ausencia. Verificar calidad de imagen Esri, cache, atribucion y consola. No se afirma ausencia de errores de proveedores sin esta verificacion.

No se implementa backend, no se cambian rutas ni dependencias y no se elimina ninguna URL de los proveedores anteriores. La reactivacion futura exige datos/credenciales autorizados y validacion real; no hay fallback ante bloqueos.
