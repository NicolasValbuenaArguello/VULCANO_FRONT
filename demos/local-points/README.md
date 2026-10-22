# Puntos locales: aplicación demostrativa independiente

Ejemplo técnico de Angular y FastAPI. Todos los puntos son ficticios y usan
unidades cartesianas arbitrarias. No importa código, estados, autenticación,
mapas ni servicios de VULCANO. No se registra en sus rutas o menú.

## Iniciar

Desde la raíz del repositorio, en dos terminales:

```powershell
python -m uvicorn main:app --app-dir demos/local-points/backend --host 127.0.0.1 --port 8025 --workers 1
npm --prefix demos/local-points/frontend start
```

Abrir **http://127.0.0.1:4305**. La aplicación comienza con un listado vacío
si no existe el archivo de datos. No carga ejemplos ni coordenadas reales.

El frontend usa las dependencias Angular ya instaladas en el repositorio.
Python requiere FastAPI y Uvicorn; las pruebas de API requieren HTTPX.
Estas herramientas ya estaban disponibles: no se instalaron dependencias.

## Configuración y datos

- URL relativa del cliente: `frontend/src/environment.ts`.
- Proxy exclusivo del ejemplo: `frontend/proxy.conf.json`, hacia 8025.
- Contrato real de esta aplicación: http://127.0.0.1:8025/openapi.json.
- Datos: `backend/data/points.json`, excluido de Git.
- JSON escrito mediante archivo temporal y reemplazo atómico; bloqueo entre
  peticiones del mismo proceso. Usar **un solo worker**, no varias instancias
  escribiendo el mismo archivo. Persistencia para uso local demostrativo.
- Si el JSON está dañado o falla el almacenamiento, se devuelve 500; no se
  reemplazan los datos dañados por una colección vacía.

## Contrato

POST y PUT reciben `name`, `x`, `y`, `description` y `category`.
La categoría admite `punto`, `muestra` o `referencia`; su valor predeterminado
es `punto` para mantener compatibles los registros y el cliente anteriores.
`name` es obligatorio (1–100 caracteres, sin espacios externos); `x` e `y`
son números finitos, con cero y negativos permitidos. `description` es
opcional (máximo 1000 caracteres). El servidor genera `id` (UUID) y
`created_at` (UTC), que se conservan al editar. Nombres duplicados, sin
distinguir mayúsculas, devuelven 400. No se envían campos de identidad al crear.

| Método | Ruta | Respuesta |
| --- | --- | --- |
| GET | `/api/demo-points` | 200, lista de registros |
| GET | `/api/demo-points/{id}` | 200, registro; 404 si no existe |
| POST | `/api/demo-points` | 201, registro generado |
| PUT | `/api/demo-points/{id}` | 200, registro actualizado |
| DELETE | `/api/demo-points/{id}` | 204, sin cuerpo |

El cliente gestiona 400, 404, 422, 500 y fallos de conexión; conserva el
formulario tras errores. Un estado de envío bloquea dobles clics. Las
mutaciones actualizan el listado con la respuesta del servidor sin GET
adicional. El botón «Actualizar listado» permite volver a consultar el JSON.

## Validación

```powershell
python -m unittest discover -s demos/local-points/backend -v
npm --prefix demos/local-points/frontend test
npm --prefix demos/local-points/frontend run build
```

Las pruebas backend usan directorios temporales, no el archivo de datos de
la aplicación. Comprueban CRUD, persistencia entre instancias, errores,
escritura atómica y concurrencia dentro de un proceso. Las pruebas Angular
usan `HttpTestingController` y cubren CRUD, los cuatro errores HTTP, validación,
conservación de campos y prevención de envíos duplicados.

La compilación genera `frontend/dist/local-points-demo`. Para servir ese
build fuera del servidor de desarrollo, el servidor web debe reenviar
`/api/demo-points` al FastAPI demostrativo; el proxy de Angular solo funciona
con `npm start`.

## Integración ficticia en VULCANO

El mismo backend sirve ahora al cliente independiente `PuntosDemoService` de
VULCANO, usado por el modo Prueba X/Y de GRAFICAR y la hoja. El frontend de
esta carpeta sigue siendo independiente. No se transfieren datos de mapas.
Ver [estado y validación actual](../../ESTADO_COMPARTIDO_VISTAS.md).

## Resultados de la implementación inicial

- Backend: **7/7 pruebas aprobadas**, incluidos CRUD, persistencia entre
  instancias, errores 400/404/422/500, escritura atómica y concurrencia.
- Frontend: **12/12 pruebas aprobadas**: ocho del servicio con
  `HttpTestingController` y cuatro del formulario/listado.
- Compilación independiente de Angular: correcta, sin advertencias.
- OpenAPI de la instancia de 8025: confirmadas las rutas de esta aplicación.
  Proxy real en 4305: respuestas 200, 404 y 422 comprobadas.
- Chrome: creación y edición de un punto ficticio; recarga y consulta del
  valor persistido; eliminación y consulta final vacía. Se verificó un solo
  POST ante dos envíos seguidos, un PUT y un DELETE. Registro de prueba
  eliminado al finalizar. Sin excepciones en consola.
- Diseño revisado en escritorio y a 390 px de ancho, sin desbordamiento horizontal.
- El primer intento de pruebas Python dentro del sandbox encontró restricciones
  de acceso a archivos temporales. La ejecución completa fuera del sandbox pasó.

## Archivos del ejemplo

- `backend/main.py`: API, validación y almacenamiento JSON.
- `backend/test_main.py`: pruebas de API y persistencia.
- `frontend/src/point.model.ts`, `points.service.ts`, `environment.ts`: contrato,
  cliente y URL del módulo.
- `frontend/src/points.component.ts`, `.html`, `.css`: formulario y listado.
- `frontend/src/points.service.spec.ts`, `points.component.spec.ts`: pruebas HTTP/UI.
- `frontend/src/main.ts`, `index.html`: entrada independiente.
- `frontend/angular.json`, `package.json`, `proxy.conf.json`, `tsconfig*.json`:
  configuración local de compilación, pruebas y desarrollo.
- `.gitignore` y este documento.

Todos los archivos creados están dentro de `demos/local-points`. No se modificó
ningún componente, configuración o servicio existente de VULCANO.
