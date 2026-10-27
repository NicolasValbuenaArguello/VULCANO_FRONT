# Matriz de trazabilidad de autenticación

| Historia | Requisito | Archivo | Endpoint | Prueba | Estado |
|---|---|---|---|---|---|
| HU-01 | Login y bootstrap íntegro | LoginComponent; AuthService; validarLogin | /api/auth/token → /token | PV-01, PV-02 | Implementado y validado |
| HU-01 | Bearer y protección por sesión | authInterceptor; authGuard; AppShell | Backends configurados | PV-03, PV-04 | Implementado y validado |
| HU-02 | Rotación e inactividad 25/60 | AuthService (sin implementación) | /api/v1/auth/refresh | PV-11 | Pendiente |
| HU-03 | Matriz numérica pura | authorization-policy.ts | Sin HTTP | PV-05 | Implementado y validado |
| HU-03 | Permisos efectivos por función | Sidebar; app.routes.ts; AuthService | Contrato/seed sin confirmar | Sin prueba operacional por ID | Parcialmente implementado |
| HU-04 | Limpieza y aislamiento local | AuthService; AppShell; interceptores | Sin HTTP de logout | PV-04 | Implementado y validado |
| HU-04 | Revocación remota | Sin consumidor implementado | /api/v1/auth/logout | PV-11 | Pendiente |
| HU-05 | Consulta y desbloqueo IP | Sin módulo implementado | /api/v1/auth/seguridad[/bloqueo/{ip}] | PV-11 | Pendiente |
| HU-06 | Catálogos y jerarquía | CatalogosService; auth.models.ts | Bootstrap del login | PV-01 | Implementado y validado |
| HU-07 | Recuperación de perfil | Sin consumidor implementado | /api/v1/auth/yo | PV-11 | Pendiente |
| HU-08 | Documentación sin alterar lógica | 13 TS comentados; 15 comparados; cinco entregables | OpenAPI solo lectura | PV-08, PV-10, PV-12 | Implementado y validado |

## Historias y aceptación

| Historia | Necesidad | Criterios de aceptación | Estado | Evidencia |
|---|---|---|---|---|
| HU-01 | Como usuario necesito iniciar sesión con bootstrap válido. | Formulario URL-encoded; solo autenticar con tokens/usuario/catálogos completos; credenciales incorrectas dejan formulario utilizable. | Implementado y validado | login.component.spec.ts; login-contract.spec.ts; api-connection.spec.ts. Validación con backend simulado. |
| HU-02 | Como usuario necesito renovar la sesión mientras mantengo actividad. | Access 25 min, ventana 60 min, rotación única compartida y sin extender sesión por telemetría. | Pendiente | No hay refresh, listeners de actividad ni temporizador; 25/60 min son requisitos, no valores operativos verificados. |
| HU-03 | Como administrador necesito limitar funciones mediante roles y permisos. | ADMINISTRADOR vacío permite todo; otras listas limitan; aplicar a menú, ruta y acción con IDs documentados. | Parcialmente implementado | authorization-policy.spec.ts valida funciones puras; no conexión operacional. AuthService sigue usando string[]. |
| HU-04 | Como usuario necesito cerrar mi sesión e impedir reutilización local. | Limpiar tokens/catálogos, cancelar login pendiente, descartar respuestas anteriores y destruir vistas privadas; revocación remota diferenciada. | Parcialmente implementado | logout.spec.ts y app-shell.spec.ts validan cierre local. Redis/revocación pendientes. |
| HU-05 | Como administrador necesito consultar y desbloquear IPs autorizadas. | Solo administrador; contrato confirmado; mostrar IP; confirmación manual y refrescar lista tras éxito. | Pendiente | Sin módulo ni consumidor HTTP de seguridad. |
| HU-06 | Como desarrollador necesito catálogos de sesión sin consultas duplicadas. | Cinco catálogos cargados desde bootstrap; jerarquía por unidad_padre_id y limpieza al salir. | Implementado y validado | login-contract.spec.ts: cinco catálogos, búsquedas, árbol, ruta y corte de ciclos. |
| HU-07 | Como usuario necesito recuperar un perfil válido al recargar. | Persistencia respaldada por backend, consulta /yo y recuperación sin confiar solo en JWT almacenado. | Pendiente | Estado en memoria; recarga requiere nuevo login. No /yo ni persistencia segura confirmada. |
| HU-08 | Como mantenedor necesito documentación verificable del sprint. | Inventario, trazabilidad, evidencias de ejecución, TSDoc sin cambios funcionales y Word legible. | Implementado y validado | Entregables presentes; igualdad del JavaScript transpilado y validación estructural del DOCX. |

## Pruebas ejecutadas y pendientes

| ID | Caso | Esperado | Obtenido | Estado | Evidencia |
|---|---|---|---|---|---|
| PV-01 | Contrato bootstrap y atomicidad | Rechazar JSON incompleto y cargar usuario/catálogos válidos | Selección enfocada aprobada; login-contract.spec.ts y api-connection.spec.ts | Implementado y validado | pruebas-autenticacion.log |
| PV-02 | Login y mensajes | Evitar duplicados; manejar 401/422/red/500 sin detalles sensibles | Casos del componente aprobados con backend simulado | Implementado y validado | login.component.spec.ts; pruebas-autenticacion.log |
| PV-03 | Headers y límites de backend | Bearer solo a destinos configurados; no refresh en solicitudes ordinarias | Casos API aprobados; no petición de refresh | Implementado y validado | api-connection.spec.ts; pruebas-autenticacion.log |
| PV-04 | Guards y logout | Bloquear rutas tras salir, descartar respuestas antiguas, limpiar vistas privadas | Casos de logout/AppShell aprobados | Implementado y validado | logout.spec.ts; app-shell.spec.ts; pruebas-autenticacion.log |
| PV-05 | Reglas numéricas | Aplicar matriz de roles y denegar IDs/contextos inválidos | Política pura aprobada; no demuestra protección de módulos | Implementado y validado | authorization-policy.spec.ts; pruebas-autenticacion.log |
| PV-06 | Expiración y almacenamiento | Caducar según expira_en y no restaurar credenciales locales | Casos con reloj simulado aprobados | Implementado y validado | api-connection.spec.ts; login-contract.spec.ts |
| PV-07 | Suite completa del repositorio | Todas las pruebas del estado actual deberían aprobar | 166 aprobadas, 10 fallidas; 32 archivos aprobados y 5 fallidos, total 176/37 | Parcialmente implementado | pruebas-completas.log |
| PV-08 | Build desarrollo | Compilar TypeScript y templates Angular | Comando terminó correctamente | Implementado y validado | compilacion-desarrollo.log |
| PV-09 | Build producción | Cumplir compilación y presupuestos | Bloqueado por CSS Hoja Milimetrada: 19,26 kB > 18 kB | Parcialmente implementado | compilacion-produccion.log |
| PV-10 | Ausencia de cambio funcional en TSDoc | Conservar JavaScript transpilado en 15 archivos revisados | 15/15 hashes idénticos con removeComments=true | Implementado y validado | verificacion-solo-comentarios.json |
| PV-11 | Login/refresh/logout/seguridad reales v1 | Contrato y comportamiento real de FastAPI/Redis | No ejecutados; endpoints ausentes del OpenAPI local | No verificable | contexto-revision.json |
| PV-12 | Word | Paquete OOXML íntegro y apertura sin reparación | Abierto con Microsoft Word mediante COM; campos/páginas actualizados y PDF exportado; sin aprobación editorial | Implementado y validado | validacion-documento.json; PDF de presentación |

Estados permitidos: Implementado y validado; Implementado sin validar; Parcialmente implementado; Pendiente; No verificable. La validación aislada de una política no implica integración a rutas. PV-12 se completa con el acta automática de apertura del Word.
