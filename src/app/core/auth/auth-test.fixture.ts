import { LoginResponse } from './auth.models';
/** Respuesta sintetica del contrato nuevo para pruebas sin credenciales reales. */
export function loginFixture(nombre = 'tester', token = 'test-jwt'): LoginResponse {
  return {
    access_token: token, refresh_token: 'test-refresh', tipo_token: 'bearer', expira_en: 60,
    usuario: { id: 1, nombres: nombre, apellidos: 'Apellido', grado: 'CP', rol: 'ADMINISTRADOR',
      email_institucional: 'test@example.test', permisos: [], documentos_aprobados: true,
      foto_url: 'media/usuarios/1/foto.png' },
    catalogos: { tipos_unidad: [{ id: 1, codigo: 'TIPO', nombre: 'Tipo' }],
      unidades: [
        { id: 1, codigo: 'A', nombre: 'Principal', tipo_codigo: 'TIPO', unidad_padre_id: null, latitud: null, longitud: null },
        { id: 2, codigo: 'Z', nombre: 'Subordinada', tipo_codigo: 'TIPO', unidad_padre_id: 1, latitud: 4, longitud: -74 }],
      estados_operacionales: [{ id: 1, codigo: 'ACTIVO', nombre: 'Activo' }],
      estados_logisticos: [{ id: 1, codigo: 'LISTO', nombre: 'Listo' }],
      permisos: [{ id: 1, codigo: 'LEER', nombre: 'Leer', modulo: 'prueba' }] },
  };
}
