import { ContextoAutorizacion, tienePermisoNumerico, tieneAlgunPermisoNumerico, tieneTodosLosPermisosNumericos } from './authorization-policy';
/** IDs sinteticos para reglas; no son asignaciones a funcionalidades reales. */
describe('Politica numerica de autorizacion solicitada', () => {
  const contexto = (rol: ContextoAutorizacion['rol'], permisos: number[], autenticado = true): ContextoAutorizacion => ({ rol, permisos, autenticado });
  it('permite todos los IDs validos al administrador sin asignaciones', () => {
    expect(tienePermisoNumerico(contexto('ADMINISTRADOR', []), 1)).toBe(true);
    expect(tienePermisoNumerico(contexto('ADMINISTRADOR', []), 99)).toBe(true);
  });
  it('restringe al administrador con asignaciones a su lista', () => {
    expect(tienePermisoNumerico(contexto('ADMINISTRADOR', [2]), 2)).toBe(true);
    expect(tienePermisoNumerico(contexto('ADMINISTRADOR', [2]), 1)).toBe(false);
  });
  it('deniega funcionalidades al usuario sin permisos sin invalidar su sesion', () => {
    const c = contexto('USUARIO', []);
    expect(tienePermisoNumerico(c, 1)).toBe(false);
    expect(c.autenticado).toBe(true);
  });
  it('permite al usuario exclusivamente sus IDs asignados', () => {
    expect(tienePermisoNumerico(contexto('USUARIO', [1, 2]), 2)).toBe(true);
    expect(tienePermisoNumerico(contexto('USUARIO', [1, 2]), 3)).toBe(false);
  });
  it('deniega sesiones ausentes y roles desconocidos', () => {
    expect(tienePermisoNumerico(contexto('ADMINISTRADOR', [], false), 1)).toBe(false);
    expect(tienePermisoNumerico(contexto(null, [1]), 1)).toBe(false);
  });
  it.each([0, -1, 1.5, NaN, Infinity])('rechaza ID invalido %s incluso para administrador', id => {
    expect(tienePermisoNumerico(contexto('ADMINISTRADOR', []), id)).toBe(false);
  });
  it('verifica cualquier/todos y no concede acceso por requisitos vacios', () => {
    const c = contexto('USUARIO', [1, 2]);
    expect(tieneAlgunPermisoNumerico(c, [2, 3])).toBe(true);
    expect(tieneTodosLosPermisosNumericos(c, [1, 2])).toBe(true);
    expect(tieneTodosLosPermisosNumericos(c, [1, 3])).toBe(false);
    expect(tieneAlgunPermisoNumerico(c, [])).toBe(false);
    expect(tieneTodosLosPermisosNumericos(c, [])).toBe(false);
  });
  it('deniega datos de asignacion invalidos', () => {
    expect(tienePermisoNumerico(contexto('USUARIO', [1, NaN]), 1)).toBe(false);
  });
});
