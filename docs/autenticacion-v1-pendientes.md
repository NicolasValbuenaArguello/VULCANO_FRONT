# Preparacion de autenticacion v1 y contrato pendiente

27/10/2026. Esta preparacion NO completa la integracion ni activa renovaciones.

## Evidencia de revision

Se revisaron AuthService, interfaces/validador, CatalogosService, guards, interceptores, ApiConfigService, environments, proxy de desarrollo, rutas y Sidebar. El frontend utiliza /api/auth/token y el proxy elimina /api/auth antes de enviar a http://127.0.0.1:8010. La consulta de solo lectura al OpenAPI local /openapi.json publica POST /token; no documenta las nuevas rutas /api/v1/auth indicadas. No se enviaron credenciales ni solicitudes de login, refresh, logout o desbloqueo.

El contrato anterior exige permisos string[] en usuario. La solicitud nueva exige IDs numericos del JWT y cambia la regla de ADMINISTRADOR sin permisos. No se activa una mezcla de ambos contratos: faltan la respuesta bootstrap y los claims reales, cuya comprobacion exige el adjunto.

## Preparacion implementada

- core/auth/authorization-policy.ts: politica reutilizable numerica con contexto explicito autenticado/rol/permisos. ADMINISTRADOR sin asignaciones permite IDs validos; administrador con lista y USUARIO con lista quedan limitados a ella. USUARIO sin permisos no recibe acceso. No toma asignaciones del catalogo. Sesiones ausentes, roles desconocidos e IDs invalidos se deniegan. Listas vacias de requisitos no autorizan funcionalidades.
- core/auth/authorization-policy.spec.ts: pruebas aisladas de esas reglas. Los IDs de prueba son sinteticos y no representan funciones reales.

Esta politica queda preparada para incorporarse al AuthService existente cuando se confirme la fuente JWT; no se modifica la autenticacion operativa con datos supuestos. No se agregan dependencias ni se cambia diseno o modulos operacionales.

## Contratos requeridos

| Ruta solicitada | Pendiente de verificar |
| --- | --- |
| /api/v1/auth/login | Metodo, encoding/cuerpo, respuesta bootstrap y expiraciones |
| /api/v1/auth/refresh | Metodo, transporte de refresh (cuerpo/cookie), respuesta de rotacion y errores |
| /api/v1/auth/logout | Metodo, cuerpo requerido, autenticacion y respuesta de revocacion |
| /api/v1/auth/yo | Metodo y esquema de perfil |
| /api/v1/auth/seguridad | Metodo y estructura de intentos/IPs/Redis |
| /api/v1/auth/seguridad/bloqueo/{ip} | Metodo, formato de IP, cuerpo y respuesta |

Tambien faltan: ejemplo anonimo de payload JWT (sin tokens reales), nombre/tipo de exp y permisos, semantica de inactividad del refresh, mecanismo de persistencia respaldado por backend y configuracion de proxy/produccion para conservar el prefijo /api/v1/auth. No se deben asumir POST/GET/DELETE a partir del nombre de la ruta.

## Matriz de funcionalidades pendiente de IDs

Sin seeds ni asociaciones documentadas: Sistemas de artilleria, Graficar piezas, Ver piezas, Planes de operacion, Trabajos, Limites de seguridad, Inventario, Mantenimiento, Reportes y Administracion. Sidebar incluye codigos de permisos preparados, pero no documenta IDs numericos del backend. No se inventan equivalencias ni se usan todos los permisos del catalogo como asignaciones.

## Integracion prevista tras recibir contrato

Adaptar AuthService y su estado reactivo, conservar CatalogosService y conectar la politica numerica a menus, guards y acciones. El refresh compartido debe rotar ambos tokens sin concurrencia, excluir sus propias solicitudes del interceptor y reintentar una sola vez; medir interacciones humanas sin contar telemetria/mapas. Rechazo del backend o inactividad finaliza la sesion. /yo solo recuperara sesiones respaldadas por persistencia autorizada. Logout debera intentar revocacion y limpiar localmente incluso ante error, distinguiendo revocacion confirmada de limpieza local. Seguridad necesitara guard ADMINISTRADOR y confirmacion explicita por IP. Todo esto permanece pendiente, no probado ni activado.

## Validacion realizada en esta tarea

- 48 pruebas correctas en 6 archivos: politica nueva, contrato login existente, logout, conexion API, componente login y AppShell.
- npx ng build --configuration development: correcto.
- No se probaron los endpoints nuevos porque no estan publicados en el OpenAPI local consultado. No se activa renovacion, revocacion remota, recuperacion /yo ni administracion de IPs con metodos o contratos supuestos.
