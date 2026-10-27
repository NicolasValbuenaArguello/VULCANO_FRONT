# Inventario de archivos de autenticación

Fecha: 27/10/2026. Rutas relativas a la raíz del proyecto. Las firmas provienen del AST TypeScript; no se incluyen cuerpos con credenciales.

## F-01 — LoginComponent

Ruta: `src/app/pages/login/login.component.ts`

Responsabilidad: Formulario reactivo de ingreso, estado de envío y mensajes seguros.

Dependencias/consumidores: FormBuilder, AuthService, Router, DestroyRef; plantilla y fondo TopographyBackground.

Endpoints: login(usuario,password) a través de AuthService; no HTTP directo.

Seguridad: Evita envíos duplicados; takeUntilDestroyed cancela al salir; finalize libera el botón.

Errores: 401/400: credenciales; 422: revisar datos; red/servidor: mensaje controlado; contrato o timeout: error genérico.

Observaciones: El diseño no cambia. recordarUsuario no implementa persistencia de sesión. La contraseña existe en el control del formulario durante su vida; no se almacena como dato de sesión.

| Método | Entrada/parámetros | Retorno | Línea |
|---|---|---|---|
| openLogin | Sin parámetros | void | 104 |
| closeLogin | Sin parámetros | void | 109 |
| togglePassword | Sin parámetros | void | 114 |
| login | Sin parámetros | void | 120 |
| usuarioInvalid | Sin parámetros | boolean | 161 |
| passwordInvalid | Sin parámetros | boolean | 166 |
| objetivosCount | Sin parámetros | number | 171 |

## F-02 — AuthService

Ruta: `src/app/core/auth/auth.service.ts`

Responsabilidad: Fuente central de usuario, access token, expiración, refresh reservado, logout y generación local de sesión.

Dependencias/consumidores: HttpClient, ApiConfigService, Router, CatalogosService, RxJS; guards, interceptores, Sidebar y LoginComponent.

Endpoints: POST ApiConfigService.loginUrl, actualmente /api/auth/token. Ninguna solicitud de refresh, logout o perfil.

Seguridad: Tokens en memoria; validación completa previa; copia de usuario/catálogos; cancelación de login anterior; limpieza de claves antiguas; respuestas aisladas por generación.

Errores: Timeout de 30000 ms; error de login limpia estado sin cancelar su propia notificación. Fallos de limpieza/navegación se advierten y no restauran la sesión.

Observaciones: isAuthenticated revisa la fecha absoluta derivada de expira_en; no decodifica JWT. getCurrentUser/getRole no comprueban por sí mismos expiración. Mock preexistente solo si useMockAuth y no producción, actualmente desactivado. No se reproducen sus credenciales en este documento.

| Método | Entrada/parámetros | Retorno | Línea |
|---|---|---|---|
| sessionGeneration | Sin parámetros | number | 41 |
| registerSessionCleanup | cleanup: () => void | () => void | 46 |
| constructor | private readonly http: HttpClient, private readonly apiConfig: ApiConfigService, private readonly router: Router, private readonly catalogos: CatalogosService | inferido por TypeScript | 56 |
| login | usuario: string, password: string | Observable<LoginResponse> | 70 |
| logout | Sin parámetros | Promise<void> | 83 |
| isAuthenticated | Sin parámetros | boolean | 99 |
| getToken | Sin parámetros | string \| null | 108 |
| getApiKey | Sin parámetros | string \| null | 113 |
| getCurrentUser | Sin parámetros | AuthUser \| null | 118 |
| getRole | Sin parámetros | string \| null | 123 |
| obtenerUsuario | Sin parámetros | AuthUser \| null | 128 |
| obtenerNombreCompleto | Sin parámetros | string | 130 |
| obtenerRol | Sin parámetros | string \| null | 135 |
| obtenerPermisos | Sin parámetros | string[] | 137 |
| tienePermiso | codigo: string | boolean | 141 |
| tieneRol | rol: string | boolean | 144 |
| obtenerFotoUsuario | Sin parámetros | string \| null | 147 |
| loginWithMock | usuario: string, password: string | Observable<LoginResponse> | 157 |
| loginWithBackend | usuario: string, password: string | Observable<LoginResponse> | 179 |
| applySession | session: AuthSession | void | 207 |
| clearSession | redirectToLogin = false, cancelPending = true | void | 219 |
| mapLoginResponse | response: LoginResponse | AuthSession | 244 |
| canUseMockAuth | Sin parámetros | boolean | 253 |
| removeValue | key: string | void | 258 |
| clearAuthenticationCookies | Sin parámetros | void | 266 |

## F-03 — Interfaces de autenticación

Ruta: `src/app/core/auth/auth.models.ts`

Responsabilidad: Define LoginResponse, AuthSession, UsuarioAutenticado/AuthUser, LoginRequest y los cinco catálogos.

Dependencias/consumidores: AuthService, validador, CatalogosService y pruebas.

Endpoints: Modelo del bootstrap consumido por login; no ejecuta HTTP.

Seguridad: Estructuras conocidas sin any; campos del backend conservados.

Errores: Las interfaces no validan JSON en ejecución: lo hace validarLogin.

Observaciones: El contrato activo exige usuario.permisos:string[], rol:string y expira_en:number. No existe JwtPayload activo. Los datos de tokens y usuario son campos separados, aunque todavía se exponen signals escribibles.

Funciones/entradas/retornos: constantes, interfaces, plantilla o función interceptor/guard descrita arriba; sin métodos de clase adicionales inventados. Guards retornan boolean/UrlTree; interceptores reciben solicitud y next y retornan flujo HTTP.

## F-04 — validarLogin

Ruta: `src/app/core/auth/auth-response.validator.ts`

Responsabilidad: Acota una entrada no confiable a LoginResponse verificando todos los elementos del bootstrap.

Dependencias/consumidores: LoginResponse; invocado por mapLoginResponse antes de publicar estado.

Endpoints: Sin llamadas; procesa respuesta de login.

Seguridad: Tokens no vacíos, bearer, expiración positiva y finita; usuario y cinco arreglos tipados; IDs de catálogo no duplicados.

Errores: Lanza Error controlado ante datos faltantes o incompatibles; AuthService limpia la sesión.

Observaciones: No verifica firma, exp, sub, rol numérico ni revocación. No limita tamaño de arrays ni valida todas las reglas semánticas de datos de negocio.

| Método | Entrada/parámetros | Retorno | Línea |
|---|---|---|---|
| validarLogin | v: unknown | asserts v is LoginResponse | 12 |

## F-05 — CatalogosService y NodoUnidad

Ruta: `src/app/core/auth/catalogos.service.ts`

Responsabilidad: Conserva bootstrap de catálogos y ofrece consultas de jerarquía.

Dependencias/consumidores: CatalogosLogin, UnidadMilitar, signals; AuthService carga y limpia.

Endpoints: Sin HTTP; no requiere endpoint adicional.

Seguridad: Copia al cargar y estado público de solo lectura a nivel de signal; ciclos detenidos mediante Set.

Errores: Búsquedas sin coincidencia devuelven undefined; rutas inexistentes devuelven arreglo vacío. structuredClone puede lanzar.

Observaciones: Usa unidad_padre_id para raíces, hijas, superior, árbol y ruta. Las huérfanas aparecen como raíces del árbol. Los objetos devueltos no están profundamente congelados.

| Método | Entrada/parámetros | Retorno | Línea |
|---|---|---|---|
| cargar | catalogos: CatalogosLogin | void | 11 |
| limpiar | Sin parámetros | void | 13 |
| unidades | Sin parámetros | UnidadMilitar[] | 14 |
| obtenerPrincipales | Sin parámetros | UnidadMilitar[] | 16 |
| obtenerSubordinadas | id: number | UnidadMilitar[] | 19 |
| buscarPorId | id: number | UnidadMilitar \| undefined | 22 |
| buscarPorCodigo | codigo: string | UnidadMilitar \| undefined | 25 |
| obtenerSuperior | id: number | UnidadMilitar \| undefined | 28 |
| construirJerarquia | Sin parámetros | NodoUnidad[] | 34 |
| obtenerRuta | id: number | UnidadMilitar[] | 48 |

## F-06 — Política numérica preparada

Ruta: `src/app/core/auth/authorization-policy.ts`

Responsabilidad: Reglas puras para ContextoAutorizacion con rol ADMINISTRADOR/USUARIO y permisos number[].

Dependencias/consumidores: Pruebas authorization-policy.spec.ts; sin dependencias Angular.

Endpoints: Sin HTTP ni conexión a JWT.

Seguridad: Administrador sin lista permite IDs válidos; demás casos exigen asignación; sesión ausente, rol inválido e IDs no positivos/enteros se deniegan.

Errores: Devuelve false, sin lanzar, para contextos inválidos; listas vacías de requisitos no autorizan.

Observaciones: NO se importa desde AuthService, rutas o menús. Las pruebas prueban la política aislada, no autorización operacional. No confundir con tienePermiso(codigo:string).

| Método | Entrada/parámetros | Retorno | Línea |
|---|---|---|---|
| tienePermisoNumerico | contexto: ContextoAutorizacion, id: number | boolean | 17 |
| tieneAlgunPermisoNumerico | contexto: ContextoAutorizacion, ids: readonly number[] | boolean | 29 |
| tieneTodosLosPermisosNumericos | contexto: ContextoAutorizacion, ids: readonly number[] | boolean | 35 |

## F-07 — authGuard

Ruta: `src/app/core/auth/auth.guard.ts`

Responsabilidad: Protege las rutas hijas del AppShell por presencia de sesión local vigente.

Dependencias/consumidores: AuthService, Router, APP_PATHS; app.routes.ts.

Endpoints: Sin HTTP.

Seguridad: Retorna UrlTree a /login en lugar de navegar imperativamente.

Errores: No hay sesión: redirección; token vencido: AuthService limpia estado.

Observaciones: No comprueba rol ni permisos de una funcionalidad; no valida vigencia remota.

Funciones/entradas/retornos: constantes, interfaces, plantilla o función interceptor/guard descrita arriba; sin métodos de clase adicionales inventados. Guards retornan boolean/UrlTree; interceptores reciben solicitud y next y retornan flujo HTTP.

## F-08 — guestGuard

Ruta: `src/app/core/auth/guest.guard.ts`

Responsabilidad: Reserva login a visitantes sin sesión local activa.

Dependencias/consumidores: AuthService, Router, APP_PATHS.

Endpoints: Sin HTTP.

Seguridad: Con sesión retorna UrlTree a /home.

Errores: Sin sesión permite acceso; la expiración se evalúa en AuthService.

Observaciones: No es un guard de administrador ni sustituye autorización del servidor.

Funciones/entradas/retornos: constantes, interfaces, plantilla o función interceptor/guard descrita arriba; sin métodos de clase adicionales inventados. Guards retornan boolean/UrlTree; interceptores reciben solicitud y next y retornan flujo HTTP.

## F-09 — Contextos HTTP

Ruta: `src/app/core/auth/auth-http-context.ts`

Responsabilidad: Declara SKIP_AUTH_INTERCEPTOR y SKIP_ERROR_INTERCEPTOR con valor por defecto false.

Dependencias/consumidores: AuthService e interceptores auth/error.

Endpoints: Login utiliza ambos contextos de exclusión.

Seguridad: Evita adjuntar credenciales previas y evita logout global ante credenciales incorrectas.

Errores: No procesa errores; controla qué interceptor los atiende.

Observaciones: No existe contexto de reintento/refresh en esta versión.

Funciones/entradas/retornos: constantes, interfaces, plantilla o función interceptor/guard descrita arriba; sin métodos de clase adicionales inventados. Guards retornan boolean/UrlTree; interceptores reciben solicitud y next y retornan flujo HTTP.

## F-10 — authInterceptor

Ruta: `src/app/core/interceptors/auth.interceptor.ts`

Responsabilidad: Adjunta Bearer a backends configurados, controla cache y filtra éxitos obsoletos.

Dependencias/consumidores: ApiConfigService, AuthService, SKIP_AUTH_INTERCEPTOR, RxJS filter.

Endpoints: Actúa en las bases configuradas; excluye token Bearer del login.

Seguridad: Comparación de origen y límite de ruta; cache:no-store en backends; proveedores externos no reciben credenciales.

Errores: No renueva ni reintenta; deja errores al siguiente interceptor. Solo filtra respuestas exitosas por generación.

Observaciones: X-API-Key se conserva como compatibilidad pero su signal queda null con el contrato vigente. No envía refresh token.

Funciones/entradas/retornos: constantes, interfaces, plantilla o función interceptor/guard descrita arriba; sin métodos de clase adicionales inventados. Guards retornan boolean/UrlTree; interceptores reciben solicitud y next y retornan flujo HTTP.

## F-11 — errorInterceptor

Ruta: `src/app/core/interceptors/error.interceptor.ts`

Responsabilidad: Centraliza 401/403/5xx de los backends configurados.

Dependencias/consumidores: ApiConfigService, AuthService, SKIP_ERROR_INTERCEPTOR.

Endpoints: No crea solicitudes propias salvo logout local por AuthService.

Seguridad: 401 protegido solo afecta a la generación actual; login/exteriores excluidos; 403 no cierra sesión.

Errores: Rethrow de errores; 403 advierte; 5xx registra error completo en consola.

Observaciones: Hallazgo: HttpErrorResponse completo puede contener detalles sensibles del backend. Redactar logs en futuro sprint; no se cambia el comportamiento en esta fase.

Funciones/entradas/retornos: constantes, interfaces, plantilla o función interceptor/guard descrita arriba; sin métodos de clase adicionales inventados. Guards retornan boolean/UrlTree; interceptores reciben solicitud y next y retornan flujo HTTP.

## F-12 — loaderInterceptor

Ruta: `src/app/core/interceptors/loader.interceptor.ts`

Responsabilidad: Activa LoaderService únicamente para solicitudes con LOADER_OPERATION.

Dependencias/consumidores: LoaderService; defer/finalize.

Endpoints: Transversal; no define endpoints.

Seguridad: No clasifica peticiones automáticas como actividad humana ni implementa temporizador de sesión.

Errores: finalize libera operación también en error/cancelación.

Observaciones: No sustituye el signal isSubmitting del login; incluido por su orden en la cadena global.

Funciones/entradas/retornos: constantes, interfaces, plantilla o función interceptor/guard descrita arriba; sin métodos de clase adicionales inventados. Guards retornan boolean/UrlTree; interceptores reciben solicitud y next y retornan flujo HTTP.

## F-13 — ApiConfigService

Ruta: `src/app/core/services/api-config.service.ts`

Responsabilidad: Centraliza bases, URLs de login/logout/refresh y límites de destino.

Dependencias/consumidores: environment.api y environment.endpoints; AuthService e interceptores.

Endpoints: loginUrl=/api/auth/token; logoutUrl=/api/auth/logout y refreshTokenUrl=/api/auth/refresh configuradas pero no consumidas.

Seguridad: matchesBaseUrl verifica origin y frontera de pathname, evitando prefijos parecidos.

Errores: URL inválida produce false; base faltante utiliza respaldo auth.

Observaciones: joinUrl concatena, no descubre contrato ni convierte las rutas existentes a v1. La base de fotos se resuelve desde el origen auth.

| Método | Entrada/parámetros | Retorno | Línea |
|---|---|---|---|
| authBaseUrl | Sin parámetros | string | 13 |
| usuariosBaseUrl | Sin parámetros | string | 17 |
| archivosBaseUrl | Sin parámetros | string | 21 |
| operacionesBaseUrl | Sin parámetros | string | 25 |
| loginUrl | Sin parámetros | string | 29 |
| logoutUrl | Sin parámetros | string | 33 |
| refreshTokenUrl | Sin parámetros | string | 37 |
| isBackendUrl | url: string | boolean | 43 |
| isAuthEndpoint | url: string | boolean | 48 |
| isLoginEndpoint | url: string | boolean | 54 |
| getApiBaseUrl | service: keyof BackendMap | string | 60 |
| getBackendMap | Sin parámetros | BackendMap | 65 |
| getBackendBases | Sin parámetros | string[] | 69 |
| joinUrl | baseUrl: string, path: string | string | 79 |
| matchesBaseUrl | url: string, baseUrl: string | boolean | 85 |

## F-14 — NavigationService

Ruta: `src/app/core/services/navigation.service.ts`

Responsabilidad: Preparado para registrar NavigationEnd y nombre de usuario en un signal en memoria.

Dependencias/consumidores: Router, AuthService, DestroyRef; RxJS y takeUntilDestroyed.

Endpoints: Sin HTTP.

Seguridad: No guarda tokens ni credenciales en sus entradas.

Errores: No constituye auditoría persistente ni demuestra eventos del servidor.

Observaciones: No se encontró inyección/instanciación en app.ts ni otros consumidores; no afirmar que el registro esté activo. Si se activa, definir retención y limpieza al cambiar de usuario.

| Método | Entrada/parámetros | Retorno | Línea |
|---|---|---|---|
| constructor | Sin parámetros | inferido por TypeScript | 26 |

## F-15 — Sidebar y MenuItem

Ruta: `src/app/pages/sidebar/sidebar.ts`

Responsabilidad: Navegación de escritorio/móvil, visibilidad estática, cierre de menús y acción Salir.

Dependencias/consumidores: AuthService, ElementRef, RouterLink, RouterLinkActive, APP_PATHS.

Endpoints: Logout delegado a AuthService, actualmente solo local.

Seguridad: Salir es botón; cierra menús y utiliza cierre centralizado.

Errores: No hace HTTP ni asigna permisos ante errores.

Observaciones: canShowItem solo evalúa item.permiso !== false; permisoCodigo es metadato no aplicado. El menú no filtra por IDs del backend.

| Método | Entrada/parámetros | Retorno | Línea |
|---|---|---|---|
| toggleDropdown | name: string | void | 105 |
| closeMenus | Sin parámetros | void | 109 |
| isDropdownOpen | name: string | boolean | 114 |
| onDropdownTriggerKeydown | event: KeyboardEvent, item: MenuItem | void | 118 |
| onDropdownLinkClick | Sin parámetros | void | 137 |
| toggleMobileMenu | Sin parámetros | void | 145 |
| onMobileNavigate | Sin parámetros | void | 152 |
| logout | Sin parámetros | void | 158 |
| canShowItem | item: MenuItem | boolean | 169 |
| getVisibleChildren | item: MenuItem | MenuItem[] | 173 |
| hasVisibleChildren | item: MenuItem | boolean | 177 |
| onDocumentClick | event: MouseEvent | void | 185 |
| onEscape | Sin parámetros | void | 192 |

## F-16 — AppShell

Ruta: `src/app/layout/app-shell.ts`

Responsabilidad: Contenedor protegido y propietario del ciclo de vida de vistas/caché privada.

Dependencias/consumidores: AuthService, MapaElementosService, IconosService, MeasurementService, MapActionsService; PuntosDemoService por instancia.

Endpoints: No crea endpoints de autenticación.

Seguridad: Registra callback de limpieza; destruye vistas al navegar fuera y evita heredar caché de otro usuario.

Errores: AuthService aísla errores de callbacks; ngOnDestroy retira registro y limpia estado.

Observaciones: La documentación no altera herramientas geográficas ni sus algoritmos.

| Método | Entrada/parámetros | Retorno | Línea |
|---|---|---|---|
| clearPrivateState | Sin parámetros | void | 30 |
| ngOnDestroy | Sin parámetros | void | 39 |

## F-17 — routes

Ruta: `src/app/app.routes.ts`

Responsabilidad: Define login con guestGuard y AppShell con canActivateChild authGuard.

Dependencias/consumidores: Componentes cargados de forma diferida y APP_ROUTES.

Endpoints: Rutas frontend; no son endpoints del backend.

Seguridad: Rutas Home, Ingreso, Permisos, Vulcano y VulcanoLog requieren autenticación.

Errores: Fallback a Home; guards generan redirección a login cuando corresponde.

Observaciones: La ruta diagnóstica de terreno está fuera del shell. No hay guard por IDs ni módulo de seguridad administrador.

Funciones/entradas/retornos: constantes, interfaces, plantilla o función interceptor/guard descrita arriba; sin métodos de clase adicionales inventados. Guards retornan boolean/UrlTree; interceptores reciben solicitud y next y retornan flujo HTTP.

## F-18 — appConfig

Ruta: `src/app/app.config.ts`

Responsabilidad: Registra Router y HttpClient con interceptores funcionales.

Dependencias/consumidores: routes, loaderInterceptor, authInterceptor y errorInterceptor.

Endpoints: Sin rutas HTTP nuevas.

Seguridad: Orden de salida: loader → auth → error; las respuestas recorren la cadena inversa.

Errores: Registra escuchas de errores globales Angular.

Observaciones: No incorpora inicializador de recuperación de sesión ni /yo.

Funciones/entradas/retornos: constantes, interfaces, plantilla o función interceptor/guard descrita arriba; sin métodos de clase adicionales inventados. Guards retornan boolean/UrlTree; interceptores reciben solicitud y next y retornan flujo HTTP.

## F-19 — sharedEnvironment

Ruta: `src/environments/environment.shared.ts`

Responsabilidad: Define timeout, bases de servicios, endpoints y useMockAuth=false.

Dependencias/consumidores: environment.ts y environment.production.ts lo extienden.

Endpoints: Base auth /api/auth; sufijos /token, /logout, /refresh.

Seguridad: No contiene secreto de firma JWT. El modo mock requiere además no producción.

Errores: No verifica conectividad ni despliegue.

Observaciones: Otros servicios conservan direcciones localhost: verificar configuración de producción y transporte HTTPS en despliegue real, sin inferir que ya estén expuestos.

Funciones/entradas/retornos: constantes, interfaces, plantilla o función interceptor/guard descrita arriba; sin métodos de clase adicionales inventados. Guards retornan boolean/UrlTree; interceptores reciben solicitud y next y retornan flujo HTTP.

## F-20 — Proxy de desarrollo

Ruta: `proxy.conf.cjs`

Responsabilidad: Reenvía /api/auth/** al backend local y elimina el prefijo /api/auth.

Dependencias/consumidores: ng serve; backend de desarrollo.

Endpoints: /api/auth/token se traduce a /token en http://127.0.0.1:8010.

Seguridad: Configuración de desarrollo, no evidencia del proxy o HTTPS en producción.

Errores: Errores de conexión llegan al HttpClient/formulario.

Observaciones: No configura /api/v1/auth/**. Los contratos v1 requieren verificar también el proxy, no solo cambiar strings.

Funciones/entradas/retornos: constantes, interfaces, plantilla o función interceptor/guard descrita arriba; sin métodos de clase adicionales inventados. Guards retornan boolean/UrlTree; interceptores reciben solicitud y next y retornan flujo HTTP.

## F-21 — STORAGE_KEYS

Ruta: `src/app/core/constants/storage-keys.constants.ts`

Responsabilidad: Enumera claves propias antiguas de token, usuario, clave API y expiración.

Dependencias/consumidores: AuthService y pruebas de aislamiento.

Endpoints: Sin HTTP.

Seguridad: Se usan para retirar solo datos de autenticación propios en ambos almacenamientos.

Errores: AuthService captura errores de acceso al storage.

Observaciones: La existencia de claves no significa que se escriban credenciales: la sesión actual solo vive en memoria.

Funciones/entradas/retornos: constantes, interfaces, plantilla o función interceptor/guard descrita arriba; sin métodos de clase adicionales inventados. Guards retornan boolean/UrlTree; interceptores reciben solicitud y next y retornan flujo HTTP.

## F-22 — APP_ROUTES y APP_PATHS

Ruta: `src/app/core/constants/routes.constants.ts`

Responsabilidad: Nombres relativos y absolutos de navegación.

Dependencias/consumidores: Guards, Router, Sidebar, LoginComponent y AuthService.

Endpoints: No define API REST.

Seguridad: Mantiene las redirecciones centralizadas.

Errores: No maneja errores de red.

Observaciones: No documenta equivalencias entre funciones e IDs de permisos.

Funciones/entradas/retornos: constantes, interfaces, plantilla o función interceptor/guard descrita arriba; sin métodos de clase adicionales inventados. Guards retornan boolean/UrlTree; interceptores reciben solicitud y next y retornan flujo HTTP.

## F-23 — Vista de login

Ruta: `src/app/pages/login/login.component.html`

Responsabilidad: Presenta controles, envío, errores y contenidos institucionales existentes.

Dependencias/consumidores: LoginComponent, formularios reactivos y TopographyBackground.

Endpoints: Sin HTTP directo.

Seguridad: Consume estados y validación del componente; no muestra tokens.

Errores: Muestra loginError controlado por el componente.

Observaciones: No se modifica el diseño en este trabajo; CSS se revisa como referencia de paleta.

Funciones/entradas/retornos: constantes, interfaces, plantilla o función interceptor/guard descrita arriba; sin métodos de clase adicionales inventados. Guards retornan boolean/UrlTree; interceptores reciben solicitud y next y retornan flujo HTTP.

## F-24 — Vista de navegación

Ruta: `src/app/pages/sidebar/sidebar.html`

Responsabilidad: Muestra grado, nombre completo, rol y acciones de salida.

Dependencias/consumidores: Sidebar y AuthService.

Endpoints: Sin HTTP directo.

Seguridad: No imprime tokens; navegación y salida delegadas.

Errores: Sin procesamiento de respuestas.

Observaciones: Información de identidad visible, sin implementar una vista /yo ni panel de seguridad.

Funciones/entradas/retornos: constantes, interfaces, plantilla o función interceptor/guard descrita arriba; sin métodos de clase adicionales inventados. Guards retornan boolean/UrlTree; interceptores reciben solicitud y next y retornan flujo HTTP.

## Archivos de soporte y pruebas

| Ruta | Responsabilidad |
|---|---|
| src/environments/environment.ts | Extiende sharedEnvironment con production:false. |
| src/environments/environment.production.ts | Extiende sharedEnvironment con production:true. |
| src/app/pages/login/login.component.css | Referencia visual: fondo oscuro y tonos oliva; no se modifica. |
| src/app/pages/sidebar/sidebar.css | Diseño de navegación; no se modifica. |
| src/app/app.ts | Raíz con RouterOutlet; no instancia NavigationService. |
| src/app/core/auth/auth-test.fixture.ts | Bootstrap sintético para pruebas, sin credenciales reales; no es respuesta de producción. |
| src/app/core/auth/login-contract.spec.ts | Usuario, permisos textuales, cinco catálogos, jerarquía, errores y atomicidad. |
| src/app/core/auth/logout.spec.ts | Cierre local, cancelación, aislamiento entre sesiones y limpieza. |
| src/app/core/auth/authorization-policy.spec.ts | Matriz numérica aislada e IDs inválidos. |
| src/app/core/services/api-connection.spec.ts | URL-encoded, expiración, guard, destinos HTTP y respuestas 401/403. |
| src/app/core/interceptors/loader.interceptor.spec.ts | Liberación de operaciones del loader, también en error/cancelación. |
| src/app/pages/login/login.component.spec.ts | Envío único, navegación y errores seguros del formulario. |
| src/app/pages/sidebar/sidebar.spec.ts | Renderizado y acciones de salida de escritorio/móvil. |
| src/app/layout/app-shell.spec.ts | Vistas protegidas y limpieza de datos al cambiar usuario. |
| angular.json | Builders, proxy de serve y presupuestos de compilación. |
| package.json | Dependencias y comandos npm; versiones instaladas en contexto-revision.json. |
| src/app/core/auth/README.md | Material histórico; contrastar con código y este informe antes de reutilizar. |
| docs/login-contrato-fastapi.md | Informe anterior de adaptación; no sustituye la ejecución de pruebas de este corte. |
| docs/autenticacion-v1-pendientes.md | Preparación de política numérica y contratos v1 pendientes. |
