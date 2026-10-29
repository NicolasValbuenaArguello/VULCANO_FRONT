# Autenticación del frontend

Contrato vigente: [login FastAPI](../../../../docs/login-contrato-fastapi.md).
Diagnóstico actual: [persistencia de sesión](../../../../docs/persistencia-sesion-diagnostico.md).
Auditoría del registro GIS: [diagnóstico JWT y pruebas HTTP](../../../../docs/diagnostico-jwt-gis.md).

AuthService centraliza usuario, access token, refresh token, expiración y catálogos.
Los tokens permanecen exclusivamente en memoria; **recargar o abrir otra pestaña requiere login**.
No se restaura desde localStorage ni sessionStorage. No se almacenan contraseñas.

El backend local documenta POST /token; no publica un contrato de refresh/logout
ni recuperación con cookie HttpOnly. Las URLs configuradas no se invocan sin ese contrato.
El cierre actual es local, no revoca JWT en el servidor ni elimina cookies HttpOnly.

AuthGuard exige token vigente y conserva la URL solicitada en returnUrl.
GuestGuard redirige a Home si ya existe sesión válida.
Tras login validado se retoma una URL interna segura, o Home como respaldo;
los guards siguen aplicándose. Usuario.permisos determina asignaciones;
el catálogo de permisos no concede acceso.

AuthInterceptor envía Bearer exclusivamente a backends configurados y descarta
respuestas exitosas de generaciones anteriores. ErrorInterceptor cierra la sesión
local ante 401 protegido de la generación actual; 403 y fallos temporales de red
no implican logout. No hay renovación ni reintentos automáticos implementados.

Logout limpia memoria, catálogos, claves propias antiguas de ambos storages y
caches privadas registradas. Cancela login pendiente y evita cierres concurrentes.
Detalles: [cierre de sesión](../../../../docs/cierre-sesion.md).

El mock existente solo se permite con useMockAuth y fuera de producción.
No representa una sesión recuperable ni sustituye los controles del servidor.
