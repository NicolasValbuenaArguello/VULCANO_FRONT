# Adaptacion del login al contrato FastAPI

Fecha: 27/10/2026.

## Diagnostico y alcance

El frontend interpretaba `token_type`, `expires_in`, `usuario.usuario` y campos opcionales del contrato anterior; no administraba refresh token ni catalogos. Una respuesta con access token podia autenticar sin usuario o catalogos completos. Se adaptaron exclusivamente autenticacion y sus consumidores de identidad. No se modificaron diseno, rutas, backend, mapas, ventanas ni calculos operacionales en esta tarea.

El adjunto disponible contiene el contrato y las interfaces, pero no incluye el archivo JSON adicional mencionado. Se implemento y valido contra ese contrato; falta verificarlo con una respuesta real del backend en el entorno de despliegue. No se utilizaron credenciales reales ni se realizaron solicitudes al backend.

## Archivos revisados y modificados

- `src/app/core/auth/auth.models.ts`: interfaces estrictas de usuario, ambos tokens y cinco catalogos; conserva AuthUser como alias para consumidores existentes.
- `src/app/core/auth/auth.service.ts`: adapta el servicio existente, formulario URL-encoded, validacion previa, expiracion con expira_en, tokens solo en memoria y limpieza de catalogos. Conserva getToken/getRole/getCurrentUser/getApiKey, guards y cierre de sesion. getApiKey queda nulo porque el nuevo contrato no entrega una clave API. El modo mock previamente existente sigue limitado a desarrollo y ahora representa el contrato nuevo; no se agregaron credenciales.
- `src/app/pages/login/login.component.ts`: errores controlados para 401, 422, red, servidor, timeout y respuesta incompleta, sin mostrar detalles internos.
- `src/app/pages/sidebar/sidebar.html`: muestra grado, nombres y apellidos usando el estado existente y conserva el diseno.
- `src/app/core/services/navigation.service.ts`: registra el nombre completo en lugar del campo antiguo usuario.usuario; no cambia reglas de navegacion.
- `src/app/core/auth/README.md`: aviso que identifica este documento como contrato vigente.
- Pruebas existentes adaptadas: `core/services/api-connection.spec.ts`, `core/auth/logout.spec.ts`, `layout/app-shell.spec.ts` y `pages/login/login.component.spec.ts`.

Archivos creados:

- `src/app/core/auth/auth-response.validator.ts`: valida respuesta completa y registros de los cinco catalogos antes de publicar sesion. Rechaza expiracion invalida, token ausente, tipo incompatible, campos incorrectos e IDs duplicados dentro de un catalogo. No verifica criptograficamente JWT en Angular.
- `src/app/core/auth/catalogos.service.ts`: servicio central sin HTTP ni persistencia; carga y limpia catalogos y ofrece busqueda por ID/codigo, unidades principales/subordinadas/superior, arbol y ruta. Usa unidad_padre_id; detiene ciclos y representa huerfanas como raices en el arbol. No modifica formularios operacionales.
- `src/app/core/auth/auth-test.fixture.ts` y `login-contract.spec.ts`: datos sinteticos y regresiones del contrato.
- Este informe.

Tambien se revisaron `auth.guard.ts`, `guest.guard.ts`, interceptores auth/error, ApiConfigService, environments, rutas, AppShell y consumidores del usuario. Conservan sus responsabilidades; no se agregaron endpoints ni dependencias.

## Flujo actualizado

1. Login envia username/password URL-encoded a ApiConfigService.loginUrl, conservando POST /token y la configuracion de environments. No agrega credenciales anteriores a ese POST.
2. Valida access_token, refresh_token, tipo_token=bearer, expira_en positivo, usuario y los cinco catalogos completos. Un error cancela la autenticacion y limpia todo el estado; no deja sesion parcial.
3. Carga CatalogosService desde la respuesta, registra usuario y expiracion absoluta y publica el access token. Un nuevo intento cancela el anterior; logout cancela intentos pendientes.
4. AuthService expone obtenerUsuario, obtenerNombreCompleto, obtenerRol, obtenerPermisos, obtenerFotoUsuario, tienePermiso y tieneRol. La foto relativa se resuelve desde el origen del backend auth configurado, sin duplicar /api/auth; solo admite HTTP(S). Sin foto retorna null, manteniendo la representacion predeterminada. No se agrega un elemento visual nuevo.
5. El interceptor existente envia solamente el access token como Bearer a backends configurados. Respeta limites de origen/ruta y descarta respuestas exitosas de sesiones anteriores. Los 401 protegidos cierran sesion; los 401 del login se muestran en el formulario. Los guards verifican token vigente. No se envia refresh token ni se realizan llamadas de renovacion.
6. Logout elimina tokens, usuario, expiracion, catalogos y claves de autenticacion antiguas de ambos almacenamientos. Mantiene preferencias y datos ajenos a la sesion y ejecuta los mecanismos existentes de limpieza privada y redireccion.

## Persistencia, permisos y pendientes

Access y refresh token permanecen solamente en memoria. Se retira la restauracion de credenciales desde localStorage, que carecia de un mecanismo de persistencia confirmado para este nuevo contrato. Recargar/cerrar la pagina requiere iniciar sesion nuevamente. No se persiste la respuesta ni se registran tokens en consola. El refresh token queda reservado internamente para una futura integracion; no se expone mediante getToken ni como clave API.

Los permisos asignados provienen exclusivamente de usuario.permisos. catalogos.permisos describe permisos disponibles y no autoriza al usuario. Un arreglo vacio no concede permisos; ADMINISTRADOR no recibe permisos adicionales implicitamente. Las reglas actuales de navegacion se conservan; la autorizacion final corresponde al backend.

Pendiente de endpoints y contrato confirmados: renovacion, revocacion remota y persistencia mediante cookies seguras del servidor. Las URLs de refresh/logout que ya existian en configuracion no se invocan. La expiracion se comprueba al consultar autenticacion, entrar por guards o enviar solicitudes; no se incorpora un temporizador que cambie la navegacion mientras se usan herramientas.

## Validacion

- `npx ng build --configuration development`: correcto, sin errores TypeScript ni de templates Angular.
- `npx ng build`: falla por el presupuesto CSS preexistente de hoja-milimetrada.component.css (19.26 kB frente a 18 kB permitidos). No se cambia ese archivo ni el presupuesto. Tambien emite avisos CommonJS de Leaflet/MapLibre.
- Suite completa inicial: 152 pruebas correctas y 6 fallos en 158 pruebas. Fallos ajenos a autenticacion: app.spec espera el titulo inicial Hello; dos pruebas menu-sistemas esperan trabajos-1/2 en lugar de trabajos-crear/ver; dos pruebas de ventana-sistemas esperan destinos/contenido provisionales antiguos; proyectar.spec espera registrarCoordenadas pero no se invoca. No se alteran estos modulos para forzar el resultado.
- Las pruebas del nuevo contrato verifican usuario, cinco catalogos, permisos vacios, jerarquia y ciclos, expiracion, errores HTTP/red, rechazo atomico de respuestas incompletas, ausencia de escritura de tokens y cancelacion de intentos anteriores. Las regresiones existentes comprueban headers, guards, 401/403, aislamiento entre usuarios, logout y destruccion del shell privado.

Pruebas finales enfocadas: 41 correctas en 7 archivos (autenticacion, API/interceptores, guards, login, Sidebar y AppShell).
