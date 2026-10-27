import { loginFixture } from './auth-test.fixture';
import { CatalogosService } from './catalogos.service';
﻿import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from './auth.service';
import { authGuard } from './auth.guard';
import { guestGuard } from './guest.guard';
import { authInterceptor } from '../interceptors/auth.interceptor';
import { errorInterceptor } from '../interceptors/error.interceptor';
import { ApiConfigService } from '../services/api-config.service';
import { STORAGE_KEYS } from '../constants/storage-keys.constants';

/** Regresiones de aislamiento entre sesiones; no requieren un backend real. */
describe('Complete local logout', () => {
  let auth: AuthService;
  let http: HttpTestingController;
  let navigate: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    for (const key of Object.values(STORAGE_KEYS)) { localStorage.removeItem(key); sessionStorage.removeItem(key); }
    TestBed.configureTestingModule({ providers: [provideRouter([]),
      provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])), provideHttpClientTesting()] });
    auth = TestBed.inject(AuthService);
    http = TestBed.inject(HttpTestingController);
    navigate = vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
  });
  afterEach(() => {
    http.verify(); vi.restoreAllMocks();
    for (const key of Object.values(STORAGE_KEYS)) { localStorage.removeItem(key); sessionStorage.removeItem(key); }
    localStorage.removeItem('another-app'); sessionStorage.removeItem('another-app');
    document.cookie = 'another_app=; Max-Age=0; Path=/';
  });
  async function login(user = 'first') {
    const result = firstValueFrom(auth.login(user, 'password'));
    http.expectOne('/api/auth/token').flush(loginFixture(user, `${user}-jwt`));
    await result;
  }

  it('cleans both stores, memory and known cookies, preserving unrelated application data', async () => {
    await login();
    for (const key of Object.values(STORAGE_KEYS)) sessionStorage.setItem(key, 'old');
    localStorage.setItem('another-app', 'keep'); sessionStorage.setItem('another-app', 'keep');
    document.cookie = `${STORAGE_KEYS.accessToken}=old; Path=/`;
    document.cookie = 'another_app=keep; Path=/';
    const cleanup = vi.fn(); auth.registerSessionCleanup(cleanup);
    const first = auth.logout();
    expect(auth.logout()).toBe(first);
    expect(auth.isAuthenticated()).toBe(false);
    await first;
    expect(navigate).toHaveBeenCalledExactlyOnceWith('/login', { replaceUrl: true });
    expect(cleanup).toHaveBeenCalledTimes(1);
    for (const key of Object.values(STORAGE_KEYS)) {
      expect(localStorage.getItem(key)).toBeNull(); expect(sessionStorage.getItem(key)).toBeNull();
    }
    expect(auth.getRole()).toBeNull(); expect(auth.getApiKey()).toBeNull();
    expect(document.cookie).not.toContain(STORAGE_KEYS.accessToken + '=');
    expect(document.cookie).toContain('another_app=keep');
    expect(localStorage.getItem('another-app')).toBe('keep');
    expect(sessionStorage.getItem('another-app')).toBe('keep');
    const restored = new AuthService(TestBed.inject(HttpClient), TestBed.inject(ApiConfigService), TestBed.inject(Router), TestBed.inject(CatalogosService));
    expect(restored.isAuthenticated()).toBe(false);
    expect(TestBed.runInInjectionContext(() => authGuard({} as never, {} as never))).not.toBe(true);
    expect(TestBed.runInInjectionContext(() => guestGuard({} as never, {} as never))).toBe(true);
    const request = firstValueFrom(TestBed.inject(HttpClient).get('/api/vulcano/test'));
    const test = http.expectOne('/api/vulcano/test');
    expect(test.request.cache).toBe('no-store');
    expect(test.request.headers.has('Authorization')).toBe(false);
    expect(test.request.headers.has('X-API-Key')).toBe(false);
    test.flush({}); await request;
  });

  it('cancels a pending login so its response cannot restore credentials', async () => {
    const success = vi.fn();
    const subscription = auth.login('first', 'password').subscribe(success);
    const pending = http.expectOne('/api/auth/token');
    await auth.logout();
    expect(pending.cancelled).toBe(true);
    expect(subscription.closed).toBe(true);
    expect(success).not.toHaveBeenCalled();
    expect(auth.getToken()).toBeNull();
  });

  it('suppresses old successful responses and ignores an old 401 after a new login', async () => {
    await login();
    const client = TestBed.inject(HttpClient);
    const success = vi.fn();
    client.get('/api/vulcano/old').subscribe(success);
    const old = http.expectOne('/api/vulcano/old');
    client.get('/api/vulcano/old-error').subscribe({ error: () => {} });
    const oldError = http.expectOne('/api/vulcano/old-error');
    await auth.logout(); await login('second');
    old.flush({ private: 'first user data' });
    oldError.flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(success).not.toHaveBeenCalled();
    expect(auth.getToken()).toBe('second-jwt');
    expect(auth.getCurrentUser()?.nombres).toBe('second');
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('stays logged out if a cleanup or navigation fails without contacting missing endpoints', async () => {
    await login();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    auth.registerSessionCleanup(() => { throw new Error('cleanup'); });
    const remaining = vi.fn(); auth.registerSessionCleanup(remaining);
    navigate.mockRejectedValue(new Error('navigation'));
    await expect(auth.logout()).resolves.toBeUndefined();
    expect(remaining).toHaveBeenCalled();
    expect(auth.getToken()).toBeNull();
    expect(auth.loggingOut()).toBe(false);
    http.expectNone('/api/auth/logout'); http.expectNone('/api/auth/refresh');
  });
});
