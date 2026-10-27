import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from './auth.service';
import { CatalogosService } from './catalogos.service';
import { loginFixture } from './auth-test.fixture';
import { validarLogin } from './auth-response.validator';

/** Contrato nuevo, aislamiento de permisos y jerarquias basadas en IDs. */
describe('FastAPI login contract', () => {
  let auth: AuthService, http: HttpTestingController, catalogos: CatalogosService;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    auth = TestBed.inject(AuthService); http = TestBed.inject(HttpTestingController);
    catalogos = TestBed.inject(CatalogosService);
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });
  afterEach(() => { http.verify(); vi.restoreAllMocks(); });
  async function login() {
    const resultado = firstValueFrom(auth.login('tester', 'password'));
    http.expectOne('/api/auth/token').flush(loginFixture()); await resultado;
  }
  it('loads user and five catalogs without granting catalog permissions', async () => {
    const local = vi.spyOn(Storage.prototype, 'setItem');
    await login();
    expect(auth.obtenerUsuario()?.documentos_aprobados).toBe(true);
    expect(auth.obtenerNombreCompleto()).toBe('tester Apellido');
    expect(auth.obtenerRol()).toBe('ADMINISTRADOR');
    expect(auth.tieneRol('ADMINISTRADOR')).toBe(true);
    expect(auth.tienePermiso('LEER')).toBe(false);
    expect(auth.obtenerPermisos()).toEqual([]);
    expect(auth.obtenerFotoUsuario()).toBe(location.origin + '/media/usuarios/1/foto.png');
    expect(Object.values(catalogos.catalogos()!).every(v => v.length > 0)).toBe(true);
    expect(local).not.toHaveBeenCalled();
    await auth.logout();
    expect(catalogos.catalogos()).toBeNull(); expect(auth.obtenerUsuario()).toBeNull();
    expect(auth.tieneRol('ADMINISTRADOR')).toBe(false);
  });
  it('checks assigned permissions and safely resolves missing or invalid photos', async () => {
    const datos = loginFixture(); datos.usuario.permisos = ['ASIGNADO']; datos.usuario.foto_url = null;
    const resultado = firstValueFrom(auth.login('tester', 'password'));
    http.expectOne('/api/auth/token').flush(datos); await resultado;
    expect(auth.tienePermiso('ASIGNADO')).toBe(true);
    expect(auth.tienePermiso('LEER')).toBe(false);
    expect(auth.obtenerFotoUsuario()).toBeNull();
    datos.usuario.foto_url = 'javascript:alert(1)';
    const siguiente = firstValueFrom(auth.login('tester', 'password'));
    http.expectOne('/api/auth/token').flush(datos); await siguiente;
    expect(auth.obtenerFotoUsuario()).toBeNull();
  });
  it('uses parent IDs for hierarchy, lookup, parent and path', async () => {
    await login();
    expect(catalogos.obtenerPrincipales().map(u => u.id)).toEqual([1]);
    expect(catalogos.obtenerSubordinadas(1).map(u => u.id)).toEqual([2]);
    expect(catalogos.buscarPorCodigo('Z')?.id).toBe(2);
    expect(catalogos.buscarPorId(2)?.codigo).toBe('Z');
    expect(catalogos.obtenerSuperior(2)?.id).toBe(1);
    expect(catalogos.obtenerRuta(2).map(u => u.id)).toEqual([1, 2]);
    expect(catalogos.construirJerarquia()[0].subordinadas[0].unidad.id).toBe(2);
    const datos = loginFixture().catalogos;
    datos.unidades[0].unidad_padre_id = 2;
    catalogos.cargar(datos);
    expect(catalogos.obtenerRuta(2)).toHaveLength(2);
    expect(catalogos.construirJerarquia()).toHaveLength(1);
  });
  it.each(['access_token', 'refresh_token', 'usuario', 'catalogos', 'expira_en', 'tipo_token'])('rejects missing %s atomically', async campo => {
    await login();
    const datos: Record<string, unknown> = { ...loginFixture() }; delete datos[campo];
    const resultado = firstValueFrom(auth.login('tester', 'password'));
    const rechazo = expect(resultado).rejects.toThrow('incompleta');
    http.expectOne('/api/auth/token').flush(datos); await rechazo;
    expect(auth.getToken()).toBeNull(); expect(catalogos.catalogos()).toBeNull();
  });
  it('rejects malformed catalogs and validates assigned permissions independently', () => {
    const respuesta = loginFixture(); respuesta.usuario.permisos = ['LEER'];
    expect(() => validarLogin(respuesta)).not.toThrow();
    expect(() => validarLogin({ ...respuesta, catalogos: { ...respuesta.catalogos, unidades: [{}] } })).toThrow();
    expect(() => validarLogin({ ...respuesta, expira_en: 0 })).toThrow();
    expect(() => validarLogin({ ...respuesta, tipo_token: 'basic' })).toThrow();
  });
  it.each([401, 422, 500, 0])('does not authenticate on HTTP/network error %s', async status => {
    const resultado = firstValueFrom(auth.login('tester', 'password'));
    const rechazo = expect(resultado).rejects.toMatchObject({ status });
    const req = http.expectOne('/api/auth/token');
    if (status === 0) req.error(new ProgressEvent('error'));
    else req.flush({}, { status, statusText: 'Error' });
    await rechazo; expect(auth.isAuthenticated()).toBe(false); expect(catalogos.catalogos()).toBeNull();
  });
  it('cancels an earlier login when a new attempt starts', () => {
    auth.login('old', 'password').subscribe();
    const previo = http.expectOne('/api/auth/token');
    auth.login('new', 'password').subscribe();
    expect(previo.cancelled).toBe(true);
    http.expectOne('/api/auth/token').flush(loginFixture('new'));
    expect(auth.obtenerUsuario()?.nombres).toBe('new');
  });
});
