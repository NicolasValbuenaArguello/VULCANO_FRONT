import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '../auth/auth.service';
import { authGuard } from '../auth/auth.guard';
import { authInterceptor } from '../interceptors/auth.interceptor';
import { errorInterceptor } from '../interceptors/error.interceptor';
import { ApiConfigService } from './api-config.service';
import { VulcanoApiService } from './vulcano-api.service';
import { STORAGE_KEYS } from '../constants/storage-keys.constants';

describe('Vulcano API connection', () => {
  let http: HttpTestingController;
  let auth: AuthService;
  let api: VulcanoApiService;
  let navigate: ReturnType<typeof vi.spyOn>;
  const loginResponse = {
    access_token: 'test-jwt', token_type: 'bearer', api_key: 'test-key',
    usuario: { id: 1, usuario: 'tester', rol: 'ADMIN' },
  };

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [
      provideRouter([]),
      provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
      provideHttpClientTesting(),
    ] });
    http = TestBed.inject(HttpTestingController);
    auth = TestBed.inject(AuthService);
    api = TestBed.inject(VulcanoApiService);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });

  afterEach(() => { http.verify(); localStorage.clear(); vi.restoreAllMocks(); });

  async function login() {
    const result = firstValueFrom(auth.login('tester', 'a&b'));
    const req = http.expectOne('/api/auth/token');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toBe('username=tester&password=a%26b');
    expect(req.request.headers.get('Content-Type')).toBe('application/x-www-form-urlencoded');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush(loginResponse);
    await result;
  }

  it('preserves the login contract, stores the session and keeps route guards', async () => {
    expect(TestBed.runInInjectionContext(() => authGuard({} as never, {} as never))).not.toBe(true);
    await login();
    expect(auth.getToken()).toBe('test-jwt');
    expect(localStorage.getItem(STORAGE_KEYS.accessToken)).toBe('test-jwt');
    expect(TestBed.runInInjectionContext(() => authGuard({} as never, {} as never))).toBe(true);
    auth.logout();
    expect(auth.isAuthenticated()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.accessToken)).toBeNull();
    expect(navigate).toHaveBeenCalled();
  });

  it('matches API origins and path boundaries, including query strings', () => {
    const config = TestBed.inject(ApiConfigService);
    expect(config.isBackendUrl('/api/vulcano/dem/health')).toBe(true);
    expect(config.isLoginEndpoint('/api/auth/token?next=1')).toBe(true);
    expect(config.isBackendUrl(location.origin + '/api/auth/profile')).toBe(true);
    expect(config.isBackendUrl('/api/auth-evil/profile')).toBe(false);
    expect(config.isBackendUrl('https://untrusted.example/api/auth/profile')).toBe(false);
    expect(config.joinUrl('/api/vulcano/', '/dem/health')).toBe('/api/vulcano/dem/health');
  });

  it('accepts the token-only contract, restores it and expires without refresh requests', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(1_000_000);
    const response = {
      ok: true, message: 'Sesion iniciada', access_token: 'token-only',
      token_type: 'bearer', expires_in: 60,
    };
    const result = firstValueFrom(auth.login('tester', 'password'));
    http.expectOne('/api/auth/token').flush(response);
    expect(await result).toEqual(response);
    expect(auth.isAuthenticated()).toBe(true);
    expect(auth.getCurrentUser()).toBeNull();
    expect(auth.getRole()).toBeNull();
    expect(TestBed.runInInjectionContext(() => authGuard({} as never, {} as never))).toBe(true);
    const restored = new AuthService(TestBed.inject(HttpClient), TestBed.inject(ApiConfigService), TestBed.inject(Router));
    expect(restored.getToken()).toBe('token-only');
    expect(restored.expiresAt()).toBe(1_060_000);
    now.mockReturnValue(1_060_000);
    expect(restored.getToken()).toBeNull();
    expect(restored.isAuthenticated()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.accessToken)).toBeNull();
  });

  it('rejects ok:false even with HTTP 200 and clears an earlier session', async () => {
    await login();
    const result = firstValueFrom(auth.login('tester', 'password'));
    const rejected = expect(result).rejects.toThrow('Acceso denegado');
    http.expectOne('/api/auth/token').flush({ ok: false, message: 'Acceso denegado' });
    await rejected;
    expect(auth.isAuthenticated()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('rejects a success response without a token', async () => {
    const result = firstValueFrom(auth.login('tester', 'password'));
    const rejected = expect(result).rejects.toThrow('falta access_token');
    http.expectOne('/api/auth/token').flush({ ok: true, message: 'Sin token' });
    await rejected;
    expect(auth.isAuthenticated()).toBe(false);
  });

  it('does not restore an expired session', () => {
    localStorage.setItem(STORAGE_KEYS.accessToken, 'expired-token');
    localStorage.setItem(STORAGE_KEYS.expiresAt, String(Date.now() - 1000));
    const restored = new AuthService(TestBed.inject(HttpClient), TestBed.inject(ApiConfigService), TestBed.inject(Router));
    expect(restored.isAuthenticated()).toBe(false);
    expect(localStorage.getItem(STORAGE_KEYS.expiresAt)).toBeNull();
  });

  it('sends JWT only to configured backends and preserves elevation parameters', async () => {
    await login();
    const result = api.getResource(api.elevationUrl(4.65, -74.05));
    const req = http.expectOne('/api/vulcano/dem/elevacion?lat=4.65&lon=-74.05');
    expect(req.request.headers.get('Authorization')).toBe('Bearer test-jwt');
    expect(req.request.headers.get('X-API-Key')).toBe('test-key');
    req.flush(new Uint8Array(Array.from('{"elevacion":2600}', c => c.charCodeAt(0))).buffer);
    expect(await (await result).json()).toEqual({ elevacion: 2600 });
    const external = firstValueFrom(TestBed.inject(HttpClient).get('https://tiles.example/tile'));
    const tile = http.expectOne('https://tiles.example/tile');
    expect(tile.request.headers.has('Authorization')).toBe(false);
    expect(tile.request.headers.has('X-API-Key')).toBe(false);
    tile.flush({});
    await external;
  });

  it('clears a session on 401 and preserves diagnostic response status', async () => {
    await login();
    const result = api.getResource(api.healthUrl);
    http.expectOne(api.healthUrl).flush(new ArrayBuffer(0), { status: 401, statusText: 'Unauthorized' });
    expect((await result).status).toBe(401);
    expect(auth.isAuthenticated()).toBe(false);
    expect(navigate).toHaveBeenCalled();
  });

  it('retains the session on 403 and exposes the forbidden response', async () => {
    await login();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = api.getResource(api.healthUrl);
    http.expectOne(api.healthUrl).flush(new ArrayBuffer(0), { status: 403, statusText: 'Forbidden' });
    expect((await result).status).toBe(403);
    expect(auth.isAuthenticated()).toBe(true);
    expect(navigate).not.toHaveBeenCalled();
  });

  it('does not treat rejected credentials as a protected-request redirect', async () => {
    await login();
    const result = firstValueFrom(auth.login('tester', 'wrong'));
    const rejected = expect(result).rejects.toMatchObject({ status: 401 });
    const request = http.expectOne('/api/auth/token');
    expect(request.request.headers.has('Authorization')).toBe(false);
    expect(request.request.headers.has('X-API-Key')).toBe(false);
    request.flush({}, { status: 401, statusText: 'Unauthorized' });
    await rejected;
    expect(auth.isAuthenticated()).toBe(false);
    expect(navigate).not.toHaveBeenCalled();
  });
});
