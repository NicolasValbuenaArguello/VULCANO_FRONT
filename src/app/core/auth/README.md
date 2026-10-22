# Auth Architecture

Este directorio concentra la arquitectura base de autenticacion del frontend Angular.

Objetivos:
- mantener un login temporal solo para desarrollo;
- proteger rutas con guards;
- centralizar token, usuario y api key;
- preparar la integracion futura con FastAPI sin cambiar componentes;
- evitar URLs y credenciales repartidas por el proyecto.

## Estructura

- `auth.service.ts`: unica fuente de verdad para login, logout, usuario actual, token y api key.
- `auth.guard.ts`: protege rutas autenticadas.
- `guest.guard.ts`: protege rutas publicas como `/login`.
- `auth.interceptor.ts`: agrega `Authorization: Bearer ...` y `X-API-Key` cuando aplique.
- `error.interceptor.ts`: centraliza manejo de errores HTTP.
- `auth.models.ts`: modelos de usuario, request y response.
- `auth-http-context.ts`: banderas para evitar ciclos entre login, interceptores y errores.
- `api-config.service.ts`: construye URLs desde `environment`.
- `navigation.service.ts`: registra cambios de ruta del frontend.

## Login temporal

El login mock esta centralizado en `AuthService`.

Credenciales provisionales:
- usuario: `admin`
- contrasena: `admin123`

Regla de seguridad:
- el mock solo funciona si `environment.useMockAuth === true` y `environment.production === false`.
- en produccion el mock queda bloqueado aunque alguien cambie una variable por error.

No guardar nunca la contrasena en storage.

## Environment

La configuracion vive en:
- `src/environments/environment.ts`
- `src/environments/environment.production.ts`

Campos principales:
- `production`
- `useMockAuth`
- `apiBaseUrl`
- `api`
- `endpoints`

### Cambio futuro a FastAPI

Cuando el backend exista, solo debes cambiar:
- `useMockAuth: false`
- `apiBaseUrl` o `api.auth`
- endpoints si cambian

Los componentes no deberian modificarse.

## AuthService

Responsabilidades:
- iniciar sesion;
- cerrar sesion;
- reconstruir sesion al recargar;
- consultar token;
- consultar usuario actual;
- consultar rol;
- consultar api key;
- limpiar storage de forma selectiva;
- preparar el paso de mock a backend.

Metodo principal:
```ts
login(usuario: string, password: string)
```

Salida del backend esperada:
```ts
{
  access_token: "...",
  token_type: "bearer",
  api_key?: "...",
  usuario: {
    id: 1,
    usuario: "admin",
    rol: "ADMIN"
  }
}
```

## Guards

### AuthGuard

Protege rutas que requieren sesion.

Si no hay sesion:
- redirige a `/login`.

### GuestGuard

Protege rutas publicas.

Si el usuario ya esta autenticado:
- redirige a `/home`.

## Interceptors

### AuthInterceptor

Agrega headers solo para requests al backend.

Headers preparados:
- `Authorization: Bearer <token>`
- `X-API-Key: <api_key>` si existe

No intercepta:
- assets
- imagenes locales
- OBJ
- GLB
- texturas
- URLs externas que no pertenecen al backend

### ErrorInterceptor

Manejo central:
- `401`: limpia sesion y redirige a `/login`
- `403`: deja listo el manejo de acceso denegado
- `500`: registra el error sin borrar la sesion

La peticion de login usa `HttpContext` para evitar ciclos de logout o redireccion incorrecta.

## Rutas

Rutas centrales:
- `APP_ROUTES.LOGIN`
- `APP_ROUTES.HOME`

Paths:
- `APP_PATHS.LOGIN`
- `APP_PATHS.HOME`

Agregar una ruta protegida nueva es simple:
```ts
{
  path: 'usuarios',
  canActivate: [authGuard],
  loadComponent: () => import('./pages/usuarios/usuarios.component').then(m => m.UsuariosComponent)
}
```

## Logout

`AuthService.logout()`:
- elimina `access_token`
- elimina `usuario`
- elimina `api_key`
- limpia el estado reactivo
- redirige a `/login`

No usa `localStorage.clear()`.

## Sesion al recargar

La sesion se reconstruye desde `localStorage` al iniciar el servicio.

Eso permite:
- login
- F5
- seguir autenticado

## NavigationService

Registra internamente:
- ruta anterior
- ruta actual
- fecha y hora
- usuario opcional

Es solo auditoria frontend y no reemplaza la auditoria del backend.

## App setup

`app.config.ts` registra:
- `provideRouter(routes)`
- `provideHttpClient(withInterceptors([authInterceptor, errorInterceptor]))`

`app.ts` instancia `NavigationService` para arrancar el registro de rutas.

## Uso del login

El login visual no debe cambiar de forma para esta arquitectura.

Solo la logica debe llamar a `AuthService.login(...)` y navegar a `/home` al resolver correctamente.

## Checklist rapido

- `admin / admin123` funciona solo en desarrollo.
- `/home` exige sesion.
- `/login` redirige a `/home` si ya hay sesion.
- `logout()` borra solo la sesion.
- `F5` conserva la sesion.
- los headers del backend salen del interceptor.
- no hay URLs hardcodeadas en los componentes.
