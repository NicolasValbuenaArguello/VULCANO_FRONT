import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpContext } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { vi } from 'vitest';
import { appConfig } from '../../app.config';
import { AuthService } from './auth.service';
import { ApiConfigService } from '../services/api-config.service';
import { GIS_AUTH_DIAGNOSTIC, SKIP_AUTH_INTERCEPTOR } from './auth-http-context';
import { loginFixture } from './auth-test.fixture';
import { GisPoligonosService, PoligonoDemo } from '../../shared/services/gis-poligonos.service';
import { environment } from '../../../environments/environment';
import { CatalogosService } from './catalogos.service';

const url = '/api/coordenadas/limites-seguridad';
const polygon: PoligonoDemo = {
  nombre: 'Contrato GIS', descripcion: 'Prueba aislada',
  geometry: { type: 'Polygon', coordinates: [[[-74, 4], [-73, 4], [-73, 5], [-74, 4]]] },
};

describe('GIS JWT: cadena HTTP real de appConfig con backend simulado', () => {
  let http: HttpTestingController, client: HttpClient, auth: AuthService;
  let config: ApiConfigService, gis: GisPoligonosService;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers, provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    client = TestBed.inject(HttpClient);
    auth = TestBed.inject(AuthService);
    config = TestBed.inject(ApiConfigService);
    gis = TestBed.inject(GisPoligonosService);
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => { http.verify(); vi.restoreAllMocks(); });
  async function login(name = 'tester') {
    const response = loginFixture(name, `test-${name}-access`);
    const result = firstValueFrom(auth.login(name, 'password'));
    const req = http.expectOne('/api/auth/token');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush(response);
    await result;
    return response;
  }

  it.each([url, `${url}/00000000-0000-0000-0000-000000000001`, location.origin + url, url + '?page=1'])
    ('recognizes the protected router without recursion: %s', value => {
      for (let i = 0; i < 100; i++) expect(config.isBackendUrl(value)).toBe(true);
    });
  it.each([
    'https://untrusted.example' + url, '//untrusted.example' + url,
    'https://localhost.untrusted.example' + url,
    url + '-externo', '/api/coordenadas/registrar', '/api/gis/poligonos',
    'https://tile.openstreetmap.org/0/0/0.png',
  ])('does not expand the credential boundary: %s', value => expect(config.isBackendUrl(value)).toBe(false));

  it('reproduces the former 401 path even with a valid local session when the GIS base is absent', async () => {
    await login();
    // Misma lista de destinos anterior a la correccion; no cambia autenticacion ni hace HTTP real.
    const previousBases = Object.values(environment.api);
    const bases = vi.spyOn(config as any, 'getBackendBases').mockReturnValue(previousBases);
    expect(config.isBackendUrl(url)).toBe(false);
    const result = firstValueFrom(gis.registrar(polygon));
    const rejected = expect(result).rejects.toMatchObject({ status: 401, error: { detail: 'Token de acceso inválido o ausente' } });
    const req = http.expectOne(url);
    expect(req.request.headers.has('Authorization')).toBe(false);
    expect(req.request.context.get(SKIP_AUTH_INTERCEPTOR)).toBe(false);
    req.flush({ detail: 'Token de acceso inválido o ausente' }, { status: 401, statusText: 'Unauthorized' });
    await rejected;
    expect(auth.getToken()).not.toBeNull(); // El error tampoco se reconocia como backend protegido.
    bases.mockRestore();
  });

  it('attaches the current access token and adapts only the HTTP DTO using the registered interceptors', async () => {
    const session = await login();
    const original = structuredClone(polygon);
    const result = firstValueFrom(gis.registrar(polygon));
    const req = http.expectOne(url);
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${session.access_token}`);
    expect(req.request.headers.get('Authorization')).not.toBe(`Bearer ${session.refresh_token}`);
    expect(req.request.cache).toBe('no-store');
    expect(req.request.body).toEqual({ nombre: polygon.nombre, descripcion: polygon.descripcion, geometria: polygon.geometry });
    expect(polygon).toEqual(original);
    const response = { ok: true, mensaje: 'Registrado', registro: { id: 'uuid-sintetico' } };
    req.flush(response, { status: 201, statusText: 'Created' });
    expect(await result).toEqual(response);
    expect(console.debug).toHaveBeenCalledWith('[GIS AUTH]', {
      url: location.origin + url, backendReconocido: true, interceptorOmitido: false,
      tokenPresente: true, authorizationAdjuntada: true, estadoSesion: 'vigente-local',
    });
    const logged = JSON.stringify(vi.mocked(console.debug).mock.calls);
    expect(logged).not.toContain(session.access_token);
    expect(logged).not.toContain(session.refresh_token);
  });

  it('honors explicit skip and strips query information from the safe diagnostic', async () => {
    await login();
    const result = firstValueFrom(client.get(url + '?secret=no-publicar', {
      context: new HttpContext().set(SKIP_AUTH_INTERCEPTOR, true).set(GIS_AUTH_DIAGNOSTIC, true),
    }));
    const req = http.expectOne(url + '?secret=no-publicar');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({}); await result;
    expect(console.debug).toHaveBeenCalledWith('[GIS AUTH]', expect.objectContaining({ interceptorOmitido: true, authorizationAdjuntada: false }));
    expect(JSON.stringify(vi.mocked(console.debug).mock.calls)).not.toContain('no-publicar');
  });

  it('does not attach credentials to an external GIS path', async () => {
    await login();
    const external = 'https://untrusted.example' + url;
    const result = firstValueFrom(client.get(external));
    const req = http.expectOne(external);
    expect(req.request.headers.has('Authorization')).toBe(false);
    expect(req.request.headers.has('X-API-Key')).toBe(false);
    req.flush({}); await result;
  });

  it('keeps diagnostics opt-in and does not throw for an invalid URL', async () => {
    for (const target of [url, 'http://[']) {
      const result = firstValueFrom(client.get(target, {
        context: new HttpContext().set(GIS_AUTH_DIAGNOSTIC, target !== url),
      }));
      http.expectOne(target).flush({});
      await result;
    }
    expect(console.debug).not.toHaveBeenCalled();
  });

  it.each([401, 403, 422])('preserves status/detail and handles %s independently', async status => {
    await login();
    const logout = vi.spyOn(auth, 'logout');
    const statusText = { 401: 'Unauthorized', 403: 'Forbidden', 422: 'Unprocessable Entity' }[status]!;
    const detail = status === 422 ? [{ loc: ['body', 'geometria'], type: 'missing', msg: 'Field required' }] : 'Rechazo de prueba';
    const result = firstValueFrom(gis.registrar(polygon));
    const rejected = expect(result).rejects.toMatchObject({ status, statusText, url, error: { detail } });
    const req = http.expectOne(url);
    expect(req.request.headers.has('Authorization')).toBe(true);
    req.flush({ detail }, { status, statusText });
    await rejected;
    expect(logout).toHaveBeenCalledTimes(status === 401 ? 1 : 0);
    expect(auth.getToken() !== null).toBe(status !== 401);
    http.expectNone('/api/auth/refresh');
  });

  it('does not send an expired token or attempt nonexistent refresh endpoints', async () => {
    await login();
    auth.expiresAt.set(Date.now() - 1);
    const result = firstValueFrom(gis.registrar(polygon));
    const req = http.expectOne(url);
    expect(req.request.headers.has('Authorization')).toBe(false);
    expect(auth.getToken()).toBeNull();
    req.flush({}); await result;
    expect(console.debug).toHaveBeenCalledWith('[GIS AUTH]', expect.objectContaining({ estadoSesion: 'vencida', authorizationAdjuntada: false }));
    http.expectNone('/api/auth/refresh');
  });

  it('starts without restored credentials after reload and respects logout', async () => {
    await login();
    const reloaded = new AuthService(client, config, TestBed.inject(Router), TestBed.inject(CatalogosService));
    expect(reloaded.getToken()).toBeNull();
    await auth.logout();
    const result = firstValueFrom(gis.registrar(polygon));
    const req = http.expectOne(url);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({}); await result;
  });

  it('uses the new GIS session and ignores a late 401 from the previous session', async () => {
    const first = await login('first');
    const oldResult = firstValueFrom(gis.registrar(polygon));
    const oldRejected = expect(oldResult).rejects.toMatchObject({ status: 401 });
    const old = http.expectOne(url);
    expect(old.request.headers.get('Authorization')).toBe(`Bearer ${first.access_token}`);
    await auth.logout();
    const second = await login('second');
    const result = firstValueFrom(gis.registrar(polygon));
    const current = http.expectOne(url);
    expect(current.request.headers.get('Authorization')).toBe(`Bearer ${second.access_token}`);
    old.flush({ detail: 'Token anterior' }, { status: 401, statusText: 'Unauthorized' });
    await oldRejected;
    expect(auth.getToken()).toBe(second.access_token);
    current.flush({}); await result;
  });

  it('preserves configured backends and rejects adjacent path prefixes', () => {
    for (const base of Object.values(environment.api)) {
      expect(config.isBackendUrl(base + '/test')).toBe(true);
      expect(config.isBackendUrl(base + '-external/test')).toBe(false);
    }
    expect(config.isBackendUrl('/api/auth/token')).toBe(true);
    expect(config.isBackendUrl('/api/vulcano/dem/health')).toBe(true);
  });
});
