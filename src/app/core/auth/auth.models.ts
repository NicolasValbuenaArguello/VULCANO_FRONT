/** Contrato de POST /token de FastAPI; nombres conservados del backend. */
export interface UsuarioAutenticado {
  id: number; nombres: string; apellidos: string; grado: string; rol: string;
  email_institucional: string; permisos: string[]; documentos_aprobados: boolean;
  foto_url: string | null;
}
export type AuthUser = UsuarioAutenticado;
export interface LoginRequest { usuario: string; password: string; }
export interface TipoUnidad { id: number; codigo: string; nombre: string; }
export interface UnidadMilitar extends TipoUnidad {
  tipo_codigo: string; unidad_padre_id: number | null;
  latitud: number | null; longitud: number | null;
}
export interface EstadoCatalogo extends TipoUnidad {}
export interface PermisoCatalogo extends TipoUnidad { modulo: string; }
export interface CatalogosLogin {
  tipos_unidad: TipoUnidad[]; unidades: UnidadMilitar[];
  estados_operacionales: EstadoCatalogo[]; estados_logisticos: EstadoCatalogo[];
  permisos: PermisoCatalogo[];
}
export interface LoginResponse {
  access_token: string; refresh_token: string; tipo_token: string; expira_en: number;
  usuario: UsuarioAutenticado; catalogos: CatalogosLogin;
}
export interface AuthSession {
  accessToken: string; refreshToken: string; user: AuthUser;
  expiresAt: number; catalogos: CatalogosLogin;
}
