# Cierre de sesion VULCANO

## Diagnostico

La entrada Salir de `sidebar` era un RouterLink a `/login`: no ejecutaba el metodo de logout. Ademas, `guestGuard` devuelve a Home si todavia existe un token, por lo que navegar directamente al login no cerraba la sesion.

AuthService persistia cuatro claves en localStorage: `vulcano_access_token`, `vulcano_user`, `vulcano_api_key` y `vulcano_expires_at`. El rol reside en el usuario; no se encontro almacenamiento independiente de permisos. El contrato actual no emite ni almacena refresh token. No se encontraron cookies de autenticacion creadas por el frontend ni CacheStorage/service worker con datos privados. No se inventan nombres de cookies, endpoints ni claves de otros sistemas.

La ruta publica existente es `/login`, que muestra inicialmente la bienvenida de VULCANO. No se crea `/index` ni se altera el enrutamiento.

## Cambios

- `src/app/pages/sidebar/sidebar.ts` y `.html`: Salir es una accion `logout` mediante button tanto en escritorio como en movil, con las clases existentes. Cierra menus y delega en AuthService. El CSS no cambia.
- `src/app/core/auth/auth.service.ts`: logout retorna Promise, bloquea duplicados concurrentes, limpia inmediatamente usuario/token/API key/vencimiento, elimina solo sus claves conocidas de ambos storages, cancela login pendiente y navega con `replaceUrl: true`. Expone un registro de callbacks privados para no depender directamente de servicios operacionales.
- La limpieza de cookies solo intenta nombres de autenticacion conocidos, visibles a JavaScript, en paths propios habituales. No elimina cookies ajenas. Cookies HttpOnly, cookies con otro nombre/path/domain y revocacion remota requieren un contrato del backend; no se declara que se hayan eliminado.
- `src/app/core/interceptors/auth.interceptor.ts`: lee credenciales actuales por peticion, descarta eventos/respuestas exitosas de generaciones anteriores y usa `cache: no-store` para los backends configurados. Las URLs externas de teselas no pasan por esa rama. Las respuestas viejas no pueden aplicar resultados a la nueva sesion; esto no deshace una operacion que el servidor ya haya ejecutado.
- `src/app/core/interceptors/error.interceptor.ts`: un 401 viejo no cierra una sesion posterior. Mantiene los errores actuales y el comportamiento existente de 401/403.
- `src/app/layout/app-shell.ts`: registra limpieza con los metodos existentes de elementos (incluye blob URLs), seleccion de iconos, mediciones y punto temporal del menu contextual. La cache `PuntosDemoService` pasa a pertenecer a la instancia protegida del shell; al abandonarla y entrar con otro usuario se obtiene una instancia vacia. No se modifica la logica de servicios operacionales. Las caches de elevaciones de datos DEM no se borran indiscriminadamente; se limpian geometria, perfiles de medicion y cursor propios del usuario.
- Guards existentes: se reutilizan sin cambios; al consultar la sesion ya no encuentran credenciales. Reemplazar la URL actual no borra todo el historial, por lo que cada retorno a una URL protegida debe seguir pasando por el guard.
- Tests nuevos: `src/app/core/auth/logout.spec.ts`, `src/app/layout/app-shell.spec.ts`; test del sidebar actualizado con sus providers reales. README de autenticacion actualizado.

No se modifican rutas, permisos de otras opciones, estilos, JWT emitidos, modelos del backend ni herramientas operacionales.

## Limites del backend

`CONFIGURACION_VULCANO.md` documenta que FastAPI no publica `/logout` ni `/refresh`. Las cadenas de entorno por si solas no acreditan endpoints operativos: no se hacen peticiones a ellos. El cierre es local; un JWT copiado antes del logout puede seguir siendo valido en el servidor hasta expirar. No se afirma revocacion remota.

Si se incorpora revocacion, hay que confirmar metodo, payload, credenciales, cookies y respuesta antes de implementarla. Debe tener timeout y registrar su fallo sin impedir la limpieza local. HttpOnly debe eliminarlo el servidor mediante Set-Cookie con path/domain correctos. No se implementa un contrato ficticio en esta fase.

Si el navegador impide borrar una clave, se registra una advertencia y se limpia de todas formas la memoria. Si falla o se cancela la navegacion, se registra el fallo sin restaurar credenciales; los guards siguen denegando accesos. No se usa localStorage.clear, sessionStorage.clear ni se borran caches o cookies de otras aplicaciones. El alcance es la pestana actual: no se agrega sincronizacion de logout entre pestanas.

## Verificacion

18 pruebas aprobadas en cinco suites, con HttpTestingController y enrutador Angular:

1. Login valido y contrato existente; expiracion y restauracion de sesion.
2. Salir como accion, en escritorio y movil, y duplicados concurrentes.
3. Eliminacion selectiva de almacenamiento, usuario/rol/API key y cookie visible propia; preservacion de datos ajenos.
4. Redireccion a `/login` con reemplazo de URL.
5. Evento popstate simulado hacia una URL protegida, y accesos directos a Home/Vulcano despues de salir: continúan en login.
6. Nueva instancia de AuthService con almacenamiento vacio, equivalente a restaurar tras recarga.
7. Segunda cuenta: shell/cache nuevos, sin registros privados anteriores; mediciones y seleccion vacias.
8. Cancelacion del login pendiente, supresion de respuesta exitosa vieja y tolerancia de un 401 anterior a la nueva sesion.
9. Peticiones posteriores sin JWT/API key y con no-store en backend.
10. Fallo de un callback privado o de navegacion: limpieza local e intentos restantes preservados; sin llamadas a endpoints remotos inexistentes.

No se probaron credenciales reales ni revocacion contra un backend. Atrás y recarga se verificaron con simulacion de historial y reconstruccion del servicio, no mediante una sesion manual en un navegador real.

Compilacion de desarrollo correcta. `npx ng build` genera el codigo Angular pero falla por el presupuesto CSS existente de Hoja Milimetrada (19,26 kB frente a 18 kB). No se cambia ese archivo ni el presupuesto.
