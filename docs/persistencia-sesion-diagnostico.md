# Persistencia de sesión: diagnóstico y alcance

Fecha: 27/10/2026.

## Causa raíz comprobada

`AuthService` inicializa sus signals sin usuario ni token y ejecuta `clearSession(false)` en el constructor. El login almacena ambos tokens exclusivamente en memoria; esa memoria desaparece al recargar o abrir otra pestaña. El guard consulta inmediatamente `isAuthenticated()` y redirige al login. No existe un bootstrap asíncrono ni renovación en el interceptor. No es un problema de los componentes cartográficos.

La consulta de solo lectura a `http://127.0.0.1:8010/openapi.json` realizada en esta revisión publica únicamente `POST /token` entre las rutas de autenticación. No publica refresh, logout ni recuperación de usuario/sesión. El esquema de respuesta exitosa de `/token` está vacío en OpenAPI. Las cadenas `/refresh` y `/logout` de environments son configuración, no prueba de soporte del servidor. Esto coincide con `CONFIGURACION_VULCANO.md`, `docs/login-contrato-fastapi.md` y `docs/autenticacion-v1-pendientes.md`.

No se enviaron credenciales, no se ejecutaron operaciones remotas de login/logout ni se inspeccionaron tokens reales. No puede descartarse una ruta no documentada: sería necesario confirmar su contrato antes de integrarla.

## Archivos revisados

- AuthService, auth.models, validador de login, CatalogosService y contexto HTTP.
- Guards auth/guest, interceptores auth/error/loader y LoaderService.
- ApiConfigService, environments, proxy, app.config y app.routes.
- Login y sus pruebas, pruebas de contrato, conexión, logout y AppShell.
- Documentación de conexión, contrato FastAPI y pendientes de autenticación.

## Cambios realizados

- `src/app/core/auth/auth.guard.ts`: conserva la URL solicitada en `returnUrl` al denegar acceso; no cambia la condición de autorización.
- `src/app/pages/login/login.component.ts`: tras validar el login, regresa al destino interno conservando query y fragmento. Rechaza destinos externos, barras ambiguas, caracteres de control y ciclos al login; usa Home como respaldo. Router vuelve a evaluar los guards.
- `src/app/pages/login/login.component.spec.ts`: verifica destino interno y rechazo de destinos inseguros, incluido login codificado.
- `src/app/layout/app-shell.spec.ts`: actualiza las expectativas de redirección protegida con `returnUrl`, conservando las comprobaciones de aislamiento entre usuarios.
- `src/app/core/auth/README.md` y este informe: explican el estado vigente sin prometer persistencia inexistente.

No se agregaron escrituras de credenciales, endpoints, dependencias ni cambios de backend, estilos o componentes operacionales.

## Límite de implementación y contrato necesario

El criterio principal (F5 sin volver al login) **no está cumplido**. No se implementaron un refresh especulativo ni restauración desde almacenamiento web. Agregar `checking` y un initializer sin una operación real de recuperación no resolvería la causa; por eso tampoco se presenta ese flujo como implementado.

Para completar la solución, el backend debe confirmar o proporcionar:

1. Ruta y método de refresh, códigos definitivos de rechazo y errores temporales; respuesta con access token, expiración, usuario y catálogos, o una operación documentada para recuperar estos últimos.
2. Refresh respaldado por cookie HttpOnly, Secure y SameSite apropiado al despliegue, con alcance de dominio/ruta, protección CSRF y configuración de credenciales/CORS cuando corresponda. Login debe establecerla; Angular no puede convertir por sí mismo el refresh del JSON en una cookie HttpOnly.
3. Revocación/logout que invalide la sesión y expire la cookie. Limpiar únicamente memoria no basta cuando haya cookies recuperables.
4. Rotación, expiración absoluta, inactividad, estado del usuario y permisos definidos y comprobados por el servidor. Recargar no debe ampliar esos plazos.

Con ese contrato, la implementación pendiente deberá usar una única restauración compartida (estado checking y loader), hacer esperar a guards y peticiones protegidas, mantener el access token en memoria y coordinar un solo refresh concurrente. Debe excluir endpoints de autenticación de la renovación, reintentar como máximo una vez solo peticiones repetibles con seguridad y descartar respuestas de generaciones previas. Solo un rechazo definitivo debe terminar la sesión; un fallo temporal debe permitir reintentar sin conceder acceso protegido ni afirmar revocación.

## Verificación

Los resultados de ejecución se detallan al cierre de este documento. Las pruebas con HttpTestingController y RouterTestingHarness son simulaciones; no equivalen a F5/Ctrl+R ni a autenticación real en navegador.

No verificados contra backend: F5/Ctrl+R, pestaña nueva autenticada, refresh válido/expirado/revocado, rotación, concurrencia real de renovación, inactividad y revocación remota. Esos escenarios requieren el contrato faltante y una sesión de prueba autorizada. El vencimiento local, permisos asignados, logout local, aislamiento de sesiones y errores HTTP/red del login sí cuentan con pruebas automatizadas existentes.

### Resultados ejecutados

- Pruebas enfocadas: `npx ng test --watch=false` con includes para core/auth, api-connection, login, AppShell y Sidebar: **57/57 correctas en 7 archivos**. Incluyen los siete casos nuevos de destino seguro y la navegacion protegida con returnUrl. La primera ejecución detectó la expectativa anterior de URL sin query en AppShell; se actualizó y se repitió correctamente.
- Suite completa: `npx ng test --watch=false`: **206 correctas, 6 fallidas, 212 totales**. Fallan App (título Hello inexistente), menu-sistemas (dos expectativas de trabajos-1/2), ventana-sistemas-artilleria (dos expectativas de destinos/contenido provisional) y proyectar (llamada esperada a registrarCoordenadas). Coinciden con fallos ya descritos en el informe del contrato de login; esos archivos no se modificaron.
- `npx ng build --configuration development`: correcto. Aviso NG8113 de VentanaLimitesSeguridad sin uso en template, ajeno al alcance.
- `npx ng build`: falla por presupuesto CSS existente de hoja-milimetrada.component.css: 19,26 kB frente a máximo de 18 kB. Avisos CommonJS de Leaflet/MapLibre y NG8113. No se modificaron presupuestos ni estilos.
- `git diff --check` del árbol completo señala espacios anteriores en hoja-milimetrada.component.ts/mapa.ts y una línea vacía final en vulcano.html; son cambios de trabajo previos, preservados.

El primer intento de pruebas en sandbox terminó con spawn EPERM de esbuild; se ejecutaron pruebas y compilaciones fuera del sandbox mediante la aprobación del entorno. No se instalaron dependencias.
