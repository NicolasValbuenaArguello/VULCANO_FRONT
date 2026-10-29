# Captura visual de coordenadas desde Leaflet 2D

El clic izquierdo utiliza el `mapClick` existente de `MapaComponent`. No se
modifica el componente del mapa ni se agrega otro listener Leaflet.

## Flujo

- `vulcano.html` conecta el evento con `Vulcano.onMapClick`.
- `Vulcano` valida los valores y normaliza la longitud de las copias del mundo
  de Leaflet al intervalo geografico. Conserva la ultima seleccion en memoria.
- Los inputs `coordenadaMapaSeleccionada` transmiten el punto por `Menu` hasta
  `VentanaLimitesSeguridad`, incluso si la ventana se abre despues del clic.
- El setter del formulario reutiliza `decimalADMS`, con su precision existente
  de cuatro decimales en segundos y acarreo de segundos/minutos. Reemplaza los
  dos hemisferios y los seis campos DMS juntos. Los decimales siguen derivados
  de DMS mediante los getters existentes y se presentan con seis decimales.
  No se conservan decimales ocultos diferentes de los valores editables.

La captura no abre ni restaura ventanas, no mueve el foco, no modifica la
camara y conserva el foco verde del formulario. Una ventana minimizada recibe
la seleccion sin restaurarse. Se conserva el orden de Tab y la edicion manual.

No se llama a `agregarPunto`, no se modifica `vertices` ni `indiceEdicion`, no
se emiten poligonos ni registros y no se ejecutan simulaciones o solicitudes
HTTP. Si se estaba editando un vertice, la captura solo reemplaza los campos
del borrador; actualizarlo sigue requiriendo la accion explicita existente.

No se agrega un marcador temporal para evitar superposiciones con marcadores,
poligonos y herramientas existentes. Las herramientas cartograficas conservan
sus propios listeners y su comportamiento.

## Verificacion

- `npx ng build --configuration development`: correcto. Persiste el aviso previo
  NG8113 del import de `VentanaLimitesSeguridad` en `Vulcano`.
- Pruebas de `vulcano.spec.ts`, `menu.spec.ts`,
  `ventana-limites-seguridad.spec.ts` y `mapa.spec.ts`: 45 pruebas aprobadas.
- La nueva prueba de integracion dispara eventos sobre la instancia Leaflet
  real en el entorno DOM de pruebas. Comprueba los valores visibles tras clics
  sucesivos en N/W, S/E y cero, normalizacion de longitud, rechazo de NaN,
  conservacion del foco y ausencia de vertices, registros, poligonos,
  simulaciones y solicitudes HTTP.
- Estas pruebas no sustituyen una comprobacion manual en navegador con la
  sesion autenticada y los mapas remotos cargados.
