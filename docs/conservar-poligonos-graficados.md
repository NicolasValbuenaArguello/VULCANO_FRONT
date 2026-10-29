# Conservación de polígonos al crear nuevos borradores

## Causa

`MapaComponent.graficarPoligono()` retiraba `capaLimitesSeguridad` mediante
`map.removeLayer(...)` antes de crear la siguiente capa GeoJSON.
`Vulcano.mostrarPoligono()` sustituía `poligonoLimitesActual` por el último
Feature y MapLibre sustituía los datos de su fuente por ese único polígono.
El reinicio del formulario no necesitaba borrar geometrías del mapa: el
problema estaba en el almacenamiento y representación de las finalizadas.

## Estados separados

- `VentanaLimitesSeguridad.vertices`: borrador editable y visor SVG temporal.
  Nueva apertura o LIMPIAR VÉRTICES solo afectan este estado local.
- `Vulcano.poligonosLimites`: colección de instantáneas finalizadas en memoria.
  `mostrarPoligono()` clona geometría, nombre y estilo, asigna identidad local
  `limite-N` y agrega a la colección sin sobrescribir las anteriores.
- La persistencia HTTP existente conserva sus servicios y endpoints. La
  identidad local no es un UUID del backend ni se usa para editar/eliminar
  registros persistidos. Recargar o abandonar la vista sigue perdiendo el
  estado solo en memoria: no se implementa recuperación nueva del backend.

## Funciones modificadas

- `Vulcano.mostrarPoligono`: incorpora la instantánea con ID propio. Mantiene
  `poligonoLimitesActual` como último polígono para la Hoja Milimetrada, cuya
  presentación existente no se modifica. Los mapas reciben la colección.
- `MapaComponent.graficarPoligono`: entrada imperativa que incorpora geometrías
  sin reemplazo. `sincronizarPoligonosLimites` mantiene una capa Leaflet por ID
  y omite las ya representadas. Conserva popup de nombre y estilo por capa;
  usa textContent para mostrar nombres como texto. Centra solo al incorporar
  una geometría nueva. La destrucción del mapa limpia sus objetos locales.
- `MapaTresD.graficarPoligono` y `sincronizarLimitesSeguridad`: usan la colección
  completa como FeatureCollection, conservan IDs y propiedades, y aplican
  colores/opacidades/grosor por Feature mediante expresiones de MapLibre.
  Se conservan una fuente y dos capas, sin añadir capas duplicadas. El handler
  style.load existente restaura toda la colección al sustituir el estilo.
- `vulcano.html`: ambos mapas reciben `poligonosLimites`; la Hoja mantiene su
  input existente del último polígono.
- `FeaturePoligono.id`: campo opcional para identidad gráfica local. El DTO HTTP
  existente sigue seleccionando sus campos de entrada, sin añadir el ID local.
- Se retiró la llamada a agregarPunto que seguía presente en el setter de
  coordenadas: recibir una captura no debe precargar un vértice en la nueva
  apertura. La captura sigue llenando DMS y los vértices se agregan por botón.

No hay clearLayers global, cambio de autenticación, modificación de endpoints,
limpieza de backend ni cambio de cálculos, terreno o simulación. No se añade
un botón nuevo ni se cambia el diseño: el flujo existente de cerrar/reabrir
inicia el siguiente borrador y conserva las finalizadas en el padre.

## Verificación

34 pruebas aprobadas en Vulcano, Menu, MapaTresD y Mapa. La nueva integración
ejecuta graficación A, reapertura B, graficación B, reapertura C, limpieza de C,
minimización/restauración y maximización/restauración. Comprueba permanencia
de las dos capas Leaflet, nombres, estilos, independencia de las instantáneas
frente a cambios del formulario y ausencia de duplicados tras detección de
cambios. Solo se simula el envío HTTP para no persistir datos reales.

La prueba MapLibre comprueba ambos Features e identidades, estilos por Feature,
render repetido sin duplicación y reconstrucción después de eliminar fuentes
y capas para simular un cambio de estilo. Las pruebas de apertura anteriores
confirman cero vértices y ausencia de duplicados en el visor temporal.

Compilación de desarrollo correcta, con aviso previo NG8113. Las pruebas
MapLibre usan un mapa simulado sin WebGL; queda pendiente una revisión visual
manual con terreno y teselas remotas cargadas.
