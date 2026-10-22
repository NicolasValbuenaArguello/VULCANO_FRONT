# Medicion geografica 2D y 3D

`MeasurementService` conserva puntos WGS84, borradores y resultados en memoria
compartida. Cambiar de visor o mapa base no borra las mediciones. Escape descarta
solo el borrador; LIMPIAR MEDICIONES elimina explicitamente los resultados y
cancela sus consultas pendientes. Ninguna herramienta guarda elementos ni usa
los endpoints de graficacion, proyeccion o simulacion balistica.

Cada mapa monta una sola `MeasurementToolsComponent` dentro de su contenedor
nativo, por lo que tambien participa del fullscreen. Los adaptadores mantienen
sus propias capas/grupos. Leaflet usa latlng; MapLibre verifica la interseccion
de superficie con terrain antes de unproject. El cielo no produce coordenadas.
El clic derecho queda en el menu existente y los controles/markers conservan
sus eventos. Las geometrías se actualizan por clic o resultado, no por movimiento.

Las distancias horizontales son ortodromicas sobre esfera de radio 6371000 m,
coherente con Leaflet y la Hoja. Son aproximaciones geograficas, no distancias
topograficas de precision. El angulo menor se obtiene en una proyeccion azimutal
equidistante local centrada en el vertice; se muestran grados y mils de 6400 por
vuelta. EPSG:9377 replica los coeficientes de la Hoja sin modificarla y se muestra
solo en el entorno nacional; fuera de este se indica su falta de aplicabilidad.

La recta espacial se estima entre extremos mediante ECEF WGS84 y cotas DEM.
No se transforma el datum vertical: se muestra expresamente esa limitacion.
El relieve es la suma de tramos horizontales con sus diferencias de cota, hasta
33 muestras por consulta. El perfil usa esas mismas muestras y nunca interpola
alturas faltantes. Falta de cobertura, nodata o fuentes/datums incompatibles impiden
publicar un perfil completo. El SVG usa datos reales recibidos del DEM; no reutiliza
la trayectoria balistica de la Hoja, que tiene otro significado y estado.

`TerrainElevationService` consulta la ruta `VulcanoApiService.elevationUrl` mediante
HttpClient, conservando los interceptores existentes. No modifica el backend ni
instala dependencias. No usa cotas de curvas, altitud de camara ni exageracion
visual del terrain. Se informa la fuente y referencia vertical recibida; si falta
metadata se indica, sin atribuir un datum conocido.

El cursor se actualiza como maximo una vez por frame. Cada nueva posicion cancela
la consulta anterior y espera 450 ms de reposo. La cache comparte respuestas en
celdas aproximadas de un metro, hasta 512 entradas: 5 minutos para datos y 30
segundos para errores/falta de cobertura. Todas las consultas comparten un maximo
de cuatro HTTP simultaneos; las consultas de relieve limitan tambien el muestreo
a 33 puntos. Limpiar/destruir retira primero los trabajos mas recientes en cola.
Los adaptadores liberan marcadores, capas, frames, interfaces y suscripciones al
destruir cada visor. MapLibre restaura solo sus capas propias tras style.load.

Las verificaciones matematicas y de HTTP estan en `measurement.spec.ts`. Los tests
utilizan respuestas DEM de prueba identificadas como tales; fuera de pruebas,
los resultados dependen de la disponibilidad y cobertura del DEM configurado.
