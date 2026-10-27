import { LoginResponse } from './auth.models';
type Registro = Record<string, unknown>;
const registro = (v: unknown): v is Registro => !!v && typeof v === 'object' && !Array.isArray(v);
const texto = (v: unknown): v is string => typeof v === 'string';
const numero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const opcionalNumero = (v: unknown) => v === null || numero(v);
const base = (v: unknown): v is Registro => registro(v) && numero(v['id']) && texto(v['codigo']) && texto(v['nombre']);
/** Valida todo antes de publicar tokens, usuario o catalogos; nunca acepta sesiones parciales. */
/** @param v JSON recibido, considerado no confiable hasta verificar sus campos.
 * @throws Error controlado si faltan tokens, usuario o catalogos, o sus tipos son incompatibles.
 * @returns Sin valor; acota el tipo a LoginResponse al completar la validacion. No verifica firma JWT. */
export function validarLogin(v: unknown): asserts v is LoginResponse {
  const fallo = () => { throw new Error('La respuesta de inicio de sesion esta incompleta o no es valida.'); };
  if (!registro(v)) return fallo();
  if (!texto(v['access_token']) || !v['access_token'].trim() ||
      !texto(v['refresh_token']) || !v['refresh_token'].trim() ||
      !texto(v['tipo_token']) || v['tipo_token'].toLowerCase() !== 'bearer' ||
      !numero(v['expira_en']) || v['expira_en'] <= 0 || !Number.isFinite(Date.now() + v['expira_en'] * 1000)) return fallo();
  const u = v['usuario'], c = v['catalogos'];
  if (!registro(u) || !numero(u['id']) ||
      !['nombres','apellidos','grado','rol','email_institucional'].every(k => texto(u[k])) ||
      !Array.isArray(u['permisos']) || !u['permisos'].every(texto) ||
      typeof u['documentos_aprobados'] !== 'boolean' || !(u['foto_url'] === null || texto(u['foto_url']))) return fallo();
  if (!registro(c)) return fallo();
  for (const k of ['tipos_unidad','unidades','estados_operacionales','estados_logisticos','permisos']) {
    const filas = c[k];
    if (!Array.isArray(filas) || !filas.every(base)) return fallo();
    if (new Set(filas.map(f => f['id'])).size !== filas.length) return fallo();
    if (k === 'unidades' && !filas.every(f => texto(f['tipo_codigo']) && opcionalNumero(f['unidad_padre_id']) && opcionalNumero(f['latitud']) && opcionalNumero(f['longitud']))) return fallo();
    if (k === 'permisos' && !filas.every(f => texto(f['modulo']))) return fallo();
  }
}
