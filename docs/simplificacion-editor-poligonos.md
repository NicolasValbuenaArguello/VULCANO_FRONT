# Simplificacion del editor local de poligonos

## Cambios

- ventana-limites-seguridad.html: se retira el panel ARCHIVO GIS INDEPENDIENTE completo (descripcion, consultas, nuevo registro, acceso al visor, identidad/version, lista y acciones sobre registros). Se eliminan Guardar en servicio GIS y Exportar GeoJSON. El pie conserva estado dinamico, Limpiar vertices y Graficar con su estilo existente.
- ventana-limites-seguridad.ts: se retiran RouterLink, RxJS, contextos de destruccion/deteccion usados exclusivamente para HTTP, inyeccion del servicio GIS, estado de registros/operaciones y metodos de consulta/carga/guardado/borrado/refresco. Tambien se retira guardarPoligono(), encargado exclusivamente de la descarga eliminada. Se conserva generarGeoJSON(), su contrato, estilo compartido y descripcion opcional para reutilizacion futura.
- ventana-limites-seguridad.spec.ts: se retiran las pruebas de descarga/CRUD que ya no forman parte de esta ventana y se agrega una regresion de las dos acciones del pie. Comprueba que abrir y graficar (valido o invalido) no genere ninguna solicitud HTTP.

## Funcionalidades conservadas

Nombre, DMS/decimales, alta/edicion/eliminacion de vertices, tabla dinamica, estilo, proyeccion compartida y SVG. Graficar valida geometria y actualiza el estado de la vista previa local, sin red ni persistencia. El mensaje de corte de antimeridiano es generico y ya no alude a exportar.

Se conservan los servicios/modelos GIS compartidos, el backend y la pagina de visores independiente: esta limpieza solo los desvincula del editor. No se modifican CSS, FloatingWindowBase, WindowManagerService, controles de ventana ni sus interacciones.

## Validacion ejecutada

- 29 pruebas aprobadas en tres archivos: 18 regresiones del editor/ventana, 9 del servicio GIS compartido y 2 de los visores independientes.
- Verificacion de conversion, limites DMS, edicion, eliminacion, estilos, SVG, validacion geometrica y generacion GeoJSON.
- Busqueda en src/app sin referencias restantes a los metodos/propiedades eliminados.
- npx ng build --configuration development: correcto.
- npx ng build: falla solo por el presupuesto CSS preexistente de hoja-milimetrada.component.css (19.26 kB frente a 18 kB). No se cambia ese archivo ni el presupuesto.
