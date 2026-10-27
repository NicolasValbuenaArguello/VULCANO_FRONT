/** Reglas numericas del contrato solicitado; el backend sigue siendo la autoridad final.
 * No convierte codigos del catalogo a IDs ni decodifica JWT sin contrato confirmado.
 */
export type RolAutorizado = 'ADMINISTRADOR' | 'USUARIO';
export interface ContextoAutorizacion {
  autenticado: boolean;
  rol: RolAutorizado | null;
  permisos: readonly number[];
}
const idValido = (id: number): boolean => Number.isSafeInteger(id) && id > 0;

/** ADMINISTRADOR sin asignaciones tiene acceso total; cualquier otra lista es restrictiva. */
/** Politica preparada y probada de forma aislada; no esta conectada a menus, guards ni AuthService.
 * @param contexto Sesion y asignaciones numericas confirmadas por el futuro adaptador.
 * @param id ID positivo y entero de una funcionalidad documentada.
 * @returns Autorizacion segun rol/lista; deniega contexto o identificadores invalidos. */
export function tienePermisoNumerico(contexto: ContextoAutorizacion, id: number): boolean {
  if (!contexto.autenticado || !idValido(id)) return false;
  if (contexto.rol !== 'ADMINISTRADOR' && contexto.rol !== 'USUARIO') return false;
  if (!contexto.permisos.every(idValido)) return false;
  return (contexto.rol === 'ADMINISTRADOR' && contexto.permisos.length === 0)
    || contexto.permisos.includes(id);
}

/** Una lista vacia de requisitos no identifica una funcionalidad autorizada. */
/** @param contexto Sesion y asignaciones numericas.
 * @param ids Requisitos no vacios, todos validos.
 * @returns Si existe al menos una asignacion autorizada. */
export function tieneAlgunPermisoNumerico(contexto: ContextoAutorizacion, ids: readonly number[]): boolean {
  return ids.length > 0 && ids.every(idValido) && ids.some(id => tienePermisoNumerico(contexto, id));
}
/** @param contexto Sesion y asignaciones numericas.
 * @param ids Requisitos no vacios.
 * @returns Si todos los IDs estan autorizados por la politica preparada. */
export function tieneTodosLosPermisosNumericos(contexto: ContextoAutorizacion, ids: readonly number[]): boolean {
  return ids.length > 0 && ids.every(id => tienePermisoNumerico(contexto, id));
}
