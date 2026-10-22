# Conexiones de VULCANO

Verificación actualizada: 30/09/2026.

## Configuración activa

`npm start` ejecuta `ng serve`. En `angular.json`, el builder
`@angular/build:dev-server` carga `proxy.conf.cjs` tanto en desarrollo como
al servir la configuración de producción. Angular CLI usa Vite internamente
y convierte `pathRewrite` a `rewrite`; no hay una configuración Vite adicional.

El destino de desarrollo queda fijo en `http://127.0.0.1:8010`.
Se eliminaron los overrides `AUTH_PROXY_TARGET` y `DEM_PROXY_TARGET` del proxy:
valores antiguos del entorno ya no pueden desviar autenticación a 8000/8001.
Al iniciar debe aparecer:

```text
[VULCANO proxy] /api/auth/* and /api/vulcano/* -> http://127.0.0.1:8010 (prefixes removed)
```

| Petición del navegador | Destino del proxy |
| --- | --- |
| POST /api/auth/token | http://127.0.0.1:8010/token |
| GET /api/vulcano/health | http://127.0.0.1:8010/health |
| GET /api/vulcano/dem/health | http://127.0.0.1:8010/dem/health |
| GET/POST /api/vulcano/dem/elevacion | http://127.0.0.1:8010/dem/elevacion |
| GET /api/vulcano/dem/tiles/{z}/{x}/{y}.png | http://127.0.0.1:8010/dem/tiles/{z}/{x}/{y}.png |

Los prefijos se eliminan una sola vez y los query strings se conservan.
`environment.ts` y `environment.production.ts` usan `sharedEnvironment`.
Angular reemplaza el primero por el segundo al compilar producción.
Se mantienen `api.auth = '/api/auth'` y `api.vulcano = '/api/vulcano'`.
Usuarios sigue en localhost:8001, archivos en localhost:9000 y operaciones
en localhost:8002. No se modificaron mapas, servicios DEM, Leaflet ni diseño.

## Autenticación

`AuthService` usa `ApiConfigService.loginUrl`, que une
`environment.api.auth` con `environment.endpoints.login`.
Envía `HttpParams` con `username/password` y Content-Type
`application/x-www-form-urlencoded`.

La respuesta reconoce `ok`, `message`, `access_token`, `token_type` y
`expires_in`, conservando compatibilidad con `usuario` y `api_key`.
Un `ok: false` rechaza la sesión y propaga el mensaje, incluso con HTTP 200.
Una respuesta sin token válido no crea sesión. Se admite Bearer, que es el
tipo usado por el interceptor; si se omite, se conserva Bearer como antes.
`expires_in` se interpreta en segundos, se guarda como vencimiento absoluto
y se comprueba al restaurar, consultar la sesión o solicitar el token.

El objeto `usuario` ahora es opcional: un token válido permite pasar el
guard de autenticación sin inventar identidad, roles o permisos.
Si el backend envía el perfil existente, se conserva; sin perfil,
`getCurrentUser()` y `getRole()` devuelven null.

Login omite los interceptores de autenticación y error general: no envía
JWT/API key anteriores ni dispara redirecciones o reintentos automáticos.
El componente conserva la protección contra envíos simultáneos.
El logout permanece local; no se invocan `/logout` ni `/refresh`,
que no están publicados por FastAPI. La renovación y revocación remotas
requieren implementación posterior en el backend.

## Arranque y diagnóstico

Desde este proyecto:

```powershell
npm start
```

FastAPI VULCANO debe estar iniciado en 127.0.0.1:8010. Arrancarlo en 8001
no satisface esta configuración: ese puerto pertenece al servicio usuarios.
No se modificó ni reinició el backend durante esta tarea.

Hay que reiniciar `ng serve` después de cambiar el proxy.
Un proceso ya abierto puede conservar su configuración anterior.
Se reinició el Angular identificado en 4200 y se dejó ejecutándose allí.

- `ECONNREFUSED`/AggregateError en Vite significa que el proxy no pudo abrir
  la conexión TCP al destino. Su 500 no demuestra un error interno de FastAPI.
- `/token` en el log de Vite es la ruta ya reescrita; el navegador usa
  `/api/auth/token`.
- Un HTTP 401 JSON de FastAPI indica conexión correcta y credenciales rechazadas.
  Los HTTP 422/500 devueltos por FastAPI son respuestas del backend y deben
  distinguirse del fallo de transporte mediante cuerpo, encabezados y logs.

## Producción

Las rutas relativas de Angular se conservan. `Dockerfile` sirve el build
mediante Nginx y `deploy/default.conf.template` elimina los mismos prefijos.
`compose.yaml` conecta el frontend a una red Docker externa existente.

Variables de despliegue:

- `AUTH_UPSTREAM`: origen interno de FastAPI, sin ruta ni barra final.
- `DEM_UPSTREAM`: mismo origen interno si auth y DEM comparten FastAPI.
- `BACKEND_NETWORK`: red Docker compartida con FastAPI.
- `FRONTEND_PORT`: puerto publicado del frontend, predeterminado 8080.

Ejemplo de origen únicamente si coincide con el alias y puerto reales:
`http://fastapi:8010`. No usar localhost para comunicar Nginx con otro contenedor.
Nginx resuelve los destinos mediante DNS Docker. Cambiar los upstreams
requiere recrear el contenedor, sin recompilar Angular.
No se ejecutó un despliegue Docker/Nginx en este entorno.

## Verificaciones realizadas

- Antes del reinicio: POST directo a 8010 devolvió 401 JSON; el mismo formulario
  por localhost:4200 devolvió 500 vacío; DEM por 4200 devolvió 200.
- Una instancia temporal recién iniciada en 4302 cargó el proxy actual y
  devolvió 401 para login y 200 para DEM. Fue detenida después de verificar.
- Tras reiniciar localhost:4200, su log confirmó la carga de `proxy.conf.cjs`.
  POST /api/auth/token devolvió 401 JSON con el mismo mensaje que FastAPI
  directo: "Usuario o contraseña incorrectos".
- GET http://localhost:4200/api/vulcano/dem/health devolvió 200 JSON.
- Se comprobó el cargador real de Angular CLI: reescritura a /token y
  /dem/health; variables antiguas a 8000/8001 no alteraron el destino 8010.
- `npm run build`: correcto. Advertencias existentes de presupuesto CSS
  del login y dependencias CommonJS de MapLibre/Leaflet.
- `npm test -- --watch=false`: 19/21 pruebas correctas, incluidas las 11
  de conexión/login. Dos fallos ya documentados: App espera un título
  inexistente; Sidebar no provee ActivatedRoute en su test.
- Las pruebas cubren contrato anterior y nuevo, token sin perfil,
  ok:false, respuesta sin token, vencimiento/restauración, 401, ausencia
  de credenciales anteriores, ausencia de reintentos y envíos simultáneos.

No se dispone de credenciales válidas: se verificó la conexión real y el rechazo
de credenciales ficticias, no una sesión real exitosa. El OpenAPI actual no
describe el esquema de éxito de /token; el nuevo contrato se verificó con tests.

Archivos cambiados en esta revisión: `proxy.conf.cjs`,
`src/app/core/auth/auth.models.ts`, `src/app/core/auth/auth.service.ts`,
`src/app/core/constants/storage-keys.constants.ts`,
`src/app/core/services/api-connection.spec.ts` y este documento.
