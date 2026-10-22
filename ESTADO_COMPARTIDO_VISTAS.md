# Estado compartido y registros demostrativos

## Causa y corrección

La hoja leía `MapaElementosService.demostracionLocal`, una colección inicializada
con P-01, P-02 y P-03. Compartir servicio no equivalía a compartir registros
persistidos. Se retiraron esa inicialización y sus métodos de ejemplo. La hoja
ahora inicia vacía y representa exclusivamente respuestas del API demostrativo.

## Fuentes de información

| Consumidor | Fuente | Representación |
| --- | --- | --- |
| Mapa 2D | MapaElementosService.elementos$ | Leaflet, sin cambios |
| Mapa 3D | MapaElementosService.elementos$ | MapLibre, sin cambios |
| Hoja milimetrada | PuntosDemoService.registros() | SVG de unidades cartesianas ficticias |
| GRAFICAR, modo Prueba X/Y ficticia | PuntosDemoService | Formulario reactivo independiente |

El modo de prueba está activado al abrir GRAFICAR. Su casilla permite volver
al formulario original. Conserva los cuatro paneles y mantiene separados los
campos, validaciones y acciones. En modo ficticio no utiliza latitud, longitud,
imágenes ni iconos del catálogo existente. Nombre y tipo de graficación se
conservan como controles; el tipo identifica una categoría genérica:
`punto`, `muestra` o `referencia`. Los marcadores usan figuras geométricas.

El listado de CONFIGURACIÓN permite seleccionar un registro para editarlo;
«Nuevo registro» limpia la selección. Guardar crea o actualiza. Eliminar requiere
confirmación visual. Actualizar listado realiza una consulta explícita. Limpiar
solo reinicia el formulario ficticio. Vista previa valida sus campos sin enviar
peticiones ni emitir eventos geográficos.

## Persistencia y estado

Se reutiliza el FastAPI independiente de `demos/local-points/backend/main.py`.
No se registran rutas nuevas en el backend de VULCANO. El contrato admite
`name`, `category`, `x`, `y` y la descripción opcional del ejemplo independiente.
Genera UUID y fecha UTC; ambos se conservan al editar. Para compatibilidad con
registros anteriores, la categoría omitida se interpreta como `punto`.

- GET/POST `/api/demo-points`.
- GET/PUT/DELETE `/api/demo-points/{id}`.
- JSON: `demos/local-points/backend/data/points.json`, excluido de Git.
- Archivo ausente: listado vacío. JSON dañado: error 500 sin sobrescribirlo.
- Escritura atómica y bloqueo dentro del proceso; ejecutar un solo worker.

`PuntosDemoService` publica snapshots inmutables, deduplicados por ID.
Formulario y hoja comparten una carga en curso mediante `shareReplay` y una
caché de sesión. No hay polling ni GET posterior a cada escritura. POST y PUT
actualizan el estado con la respuesta; DELETE lo actualiza después de la
confirmación HTTP. Los errores conservan los registros y los campos del
formulario. Se bloquean escrituras concurrentes y mientras carga el listado.

La hoja deriva únicamente icono/color desde la categoría; no posee otra
colección editable. Su cámara, zoom y selección son estado visual local.
Las tarjetas siguen el ID y se cierran cuando desaparece su registro.
Otras pestañas o clientes externos requieren «Actualizar listado» para consultar
sus cambios; no se afirma sincronización en tiempo real entre navegadores.

## Ejecución

Desde la raíz, en terminales separadas:

```powershell
python -m uvicorn main:app --app-dir demos/local-points/backend --host 127.0.0.1 --port 8025 --workers 1
npm start
```

Reiniciar `ng serve` si ya estaba ejecutándose antes del cambio del proxy.
`environment.shared.ts` define `demoRegistrar` y `demoListar`; `proxy.conf.cjs`
redirige exclusivamente `/api/demo-points` y sus IDs al puerto 8025.
Las rutas geográficas y de autenticación mantienen su configuración.
En producción, configurar el mismo reenvío en el servidor web: el proxy de
Angular solo se aplica durante desarrollo.

## Archivos de esta corrección

Creados:

- `src/app/shared/models/punto-demo.model.ts`.
- `src/app/shared/services/puntos-demo.service.ts`.

Modificados:

- `src/app/shared/services/mapa-elementos.service.ts`: retirada de ejemplos;
  CRUD geográfico original conservado íntegramente.
- `src/app/pages/vulcano/hoja-milimetrada/hoja-milimetrada.component.ts`, `.html`, `.css`:
  fuente persistente, etiquetas por nombre y estados de carga/error/vacío.
- `src/app/pages/vulcano/graficar/graficar.ts`, `.html`, `.css`: modo ficticio,
  CRUD y estilos de sus controles con la paleta existente.
- `src/environments/environment.shared.ts` y `proxy.conf.cjs`: endpoint independiente.
- `demos/local-points/backend/main.py`: categoría validada.
- Pruebas: `mapa-elementos-demo.spec.ts` (migrada al nuevo servicio),
  `hoja-milimetrada.component.spec.ts`, `graficar.spec.ts`, `vulcano.spec.ts`,
  `demos/local-points/backend/test_main.py`.
- Este documento y `demos/local-points/README.md`.

## Verificación ejecutada

- `npm run build`: correcto. Advertencias existentes: presupuesto CSS del login
  y CommonJS de Leaflet/MapLibre.
- Suite seleccionada de servicio y vistas: 16/16 aprobadas, en siete archivos.
- FastAPI: 8/8 pruebas aprobadas; CRUD, recuperación entre instancias, categorías,
  errores 400/404/422/500, archivo dañado, escritura atómica y concurrencia.
- Cliente demostrativo independiente: 12/12 pruebas aprobadas.
- Chrome en `http://localhost:4302/vulcano`, con proxy real a 8025:
  inicio con cero marcadores, cuadrícula visible, cuatro paneles y validación;
  POST, PUT, recuperación tras recarga y DELETE del registro temporal.
  Exactamente dos GET (uno por carga), un POST, un PUT y un DELETE.
  Zoom por rueda, desplazamiento y anclaje al redimensionar comprobados.
  Tarjeta mostró los valores actualizados. Sin excepciones JavaScript.
- Comparación SHA-256 con el inicio de la tarea: componentes de mapas 2D/3D,
  menú, contenedor de vistas, servicio DEM, autenticación e interceptores intactos.
  CRUD geográfico y paneles laterales/inferiores de la hoja también intactos.
- Las pruebas de alternancia conservan instancias de mapas; una modificación
  ficticia no altera su cámara. jsdom no proporciona WebGL: estas comprobaciones
  no certifican todas las funciones gráficas 3D.
- Suite general: 30/32 aprobadas. Tiene fallos ajenos al módulo en App (espera un título inicial
  inexistente) y Sidebar (falta proveedor ActivatedRoute). No se modificaron.

## Corrección posterior de integración y renderizado

Diagnóstico antes de editar: `esCoordenadaValida()` solo descartaba null;
NaN/Infinity pasaban. `convertirDmsADecimal()` podía propagarlos y el operador
`??` de `construirElementoMapa()` no sustituía NaN. El objeto susceptible de
llegar a Leaflet era el ElementoMapa publicado por `graficar()`, con latitud y
longitud inválidas. `renderElementos()` y `centrarEnElemento()` los entregaban
sin conversión a Leaflet. No se identificó el ID del objeto de la sesión del
usuario ni se afirma haber reproducido su interacción exacta.

Cambios de esta revisión:

- `graficar.ts`: validación estricta de números finitos, tratamiento de campos
  vacíos y protección del constructor de registros. Comprobación del modo
  activo antes de ejecutar acciones de escritura o vista previa.
- `puntos-demo.service.ts`: validación de entradas y respuestas en ejecución;
  rechazo de registros incompletos, coordenadas no finitas o respuestas con
  forma incorrecta. Los errores mantienen el snapshot válido previo y usan los
  mensajes visibles existentes. El payload POST/PUT solo incluye campos del
  contrato demostrativo. Las excepciones de validación liberan la carga.
- `hoja-milimetrada.component.ts`: la suscripción del botón Reintentar queda
  vinculada a la destrucción del componente.
- Pruebas modificadas: `graficar.spec.ts`, `mapa-elementos-demo.spec.ts` y
  `hoja-milimetrada.component.spec.ts`.
- Documentación: este archivo.

No se modificaron plantillas, CSS, mapas, MapaElementosService, DEM,
autenticación, proxy, environments ni backend. No había inicializaciones de
P-01/P-02/P-03 pendientes de eliminar en el código actual.

Verificaciones de esta revisión:

- OpenAPI activo: 8025 registra GET/POST `/api/demo-points` y GET/PUT/DELETE
  `/api/demo-points/{point_id}`. 8010 registra las rutas geográficas separadas.
- GET directo a 8025 y mediante proxy Angular en 4302: 200 y lista vacía.
- `npm run build`: correcto, con las advertencias existentes de CSS del login
  y CommonJS de Leaflet/MapLibre.
- Suite seleccionada inicial: 23/23 aprobadas. Se añadió después una prueba
  de respuesta inválida visible en la hoja y recuperación mediante Reintentar.
- Suite completa final: 38/40 aprobadas, incluidos los 24 casos de servicio y
  vistas seleccionados. Los únicos fallos son App (título inicial inexistente)
  y Sidebar (proveedor ActivatedRoute ausente), ajenos a esta corrección.
- FastAPI: 8/8 pruebas aprobadas, sin modificaciones de backend.
- Regresiones cubren objeto NaN bloqueado antes de publicar, modos separados,
  mensajes de carga/error, respuestas inválidas sin renderizar, conservación
  del estado, consulta compartida y ausencia de reintentos automáticos.
- Hashes de archivos protegidos comparados antes/después: ningún cambio.

Límite: no se inspeccionó la memoria de la pestaña original que presentó NaN.
Recargar esa pestaña descarta su estado transitorio anterior. Las pruebas de
renderizado usan jsdom; no constituyen una regresión completa de WebGL.
