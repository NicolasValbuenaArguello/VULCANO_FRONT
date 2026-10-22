import { HttpClient, HttpContext, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, of, throwError } from 'rxjs';
import { catchError, tap, timeout } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { APP_PATHS } from '../constants/routes.constants';
import { STORAGE_KEYS } from '../constants/storage-keys.constants';
import { ApiConfigService } from '../services/api-config.service';
import {
  AuthSession,
  AuthUser,
  LoginResponse,
} from './auth.models';
import { SKIP_AUTH_INTERCEPTOR, SKIP_ERROR_INTERCEPTOR } from './auth-http-context';

// ======================================================
// ADVERTENCIA:
// AUTENTICACION MOCK UNICAMENTE PARA DESARROLLO.
// NO USAR EN PRODUCCION.
// ======================================================

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  readonly currentUser = signal<AuthUser | null>(null);
  readonly accessToken = signal<string | null>(null);
  readonly apiKey = signal<string | null>(null);
  readonly expiresAt = signal<number | null>(null);

  constructor(
    private readonly http: HttpClient,
    private readonly apiConfig: ApiConfigService,
    private readonly router: Router,
  ) {
    this.restoreSession();
  }

  login(usuario: string, password: string): Observable<LoginResponse> {
    if (this.canUseMockAuth()) {
      return this.loginWithMock(usuario, password);
    }

    return this.loginWithBackend(usuario, password);
  }

  logout(): void {
    this.clearSession();
    void this.router.navigateByUrl(APP_PATHS.LOGIN);
  }

  isAuthenticated(): boolean {
    const expiry = this.expiresAt();
    if (expiry !== null && Date.now() >= expiry) {
      this.clearSession();
    }
    return !!this.accessToken();
  }

  getToken(): string | null {
    return this.isAuthenticated() ? this.accessToken() : null;
  }

  getApiKey(): string | null {
    return this.apiKey();
  }

  getCurrentUser(): AuthUser | null {
    return this.currentUser();
  }

  getRole(): string | null {
    return this.currentUser()?.rol ?? null;
  }

  private loginWithMock(usuario: string, password: string): Observable<LoginResponse> {
    if (usuario !== 'admin' || password !== 'admin123') {
      return throwError(() => new Error('Usuario o contrasena incorrectos.'));
    }

    const response: LoginResponse = {
      access_token: 'TEMP_TOKEN',
      token_type: 'bearer',
      api_key: 'TEMP_API_KEY',
      usuario: {
        id: 1,
        usuario: 'admin',
        rol: 'ADMIN',
      },
    };

    return of(response).pipe(
      tap((loginResponse) => this.applySession(this.mapLoginResponse(loginResponse))),
    );
  }

  private loginWithBackend(usuario: string, password: string): Observable<LoginResponse> {
    const body = new HttpParams()
      .set('username', usuario)
      .set('password', password);

    const context = new HttpContext()
      .set(SKIP_AUTH_INTERCEPTOR, true)
      .set(SKIP_ERROR_INTERCEPTOR, true);

    return this.http
      .post<LoginResponse>(this.apiConfig.loginUrl, body.toString(), {
        headers: new HttpHeaders({
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
        context,
      })
      .pipe(
        timeout(environment.timeout),
        tap((loginResponse) => this.applySession(this.mapLoginResponse(loginResponse))),
        catchError((error) => {
          this.clearSession();
          return throwError(() => error);
        }),
      );
  }

  private applySession(session: AuthSession): void {
    this.currentUser.set(session.user);
    this.accessToken.set(session.accessToken);
    this.apiKey.set(session.apiKey ?? null);
    this.expiresAt.set(session.expiresAt ?? null);

    if (session.user) {
      this.persistValue(STORAGE_KEYS.user, session.user);
    } else {
      this.removeValue(STORAGE_KEYS.user);
    }
    this.persistText(STORAGE_KEYS.accessToken, session.accessToken);
    if (session.expiresAt != null) {
      this.persistText(STORAGE_KEYS.expiresAt, String(session.expiresAt));
    } else {
      this.removeValue(STORAGE_KEYS.expiresAt);
    }

    if (session.apiKey) {
      this.persistText(STORAGE_KEYS.apiKey, session.apiKey);
    } else {
      this.removeValue(STORAGE_KEYS.apiKey);
    }
  }

  private restoreSession(): void {
    const user = this.readJson<AuthUser>(STORAGE_KEYS.user);
    const accessToken = this.readText(STORAGE_KEYS.accessToken);
    const apiKey = this.readText(STORAGE_KEYS.apiKey);
    const storedExpiry = this.readText(STORAGE_KEYS.expiresAt);
    const expiresAt = storedExpiry === null ? null : Number(storedExpiry);
    const unexpired = expiresAt === null || (Number.isFinite(expiresAt) && expiresAt > Date.now());

    if (accessToken && unexpired && (this.canUseMockAuth() || accessToken !== 'TEMP_TOKEN')) {
      this.currentUser.set(user);
      this.accessToken.set(accessToken);
      this.apiKey.set(apiKey);
      this.expiresAt.set(expiresAt);
      return;
    }

    this.clearSession(false);
  }

  private clearSession(redirectToLogin = false): void {
    this.currentUser.set(null);
    this.accessToken.set(null);
    this.apiKey.set(null);
    this.expiresAt.set(null);

    this.removeValue(STORAGE_KEYS.user);
    this.removeValue(STORAGE_KEYS.accessToken);
    this.removeValue(STORAGE_KEYS.apiKey);
    this.removeValue(STORAGE_KEYS.expiresAt);

    if (redirectToLogin) {
      void this.router.navigateByUrl(APP_PATHS.LOGIN);
    }
  }

  private mapLoginResponse(response: LoginResponse): AuthSession {
    if (response?.ok === false) {
      throw new Error(response.message || 'No fue posible iniciar sesion.');
    }
    if (typeof response?.access_token !== 'string' || !response.access_token.trim()) {
      throw new Error('Respuesta de autenticacion invalida: falta access_token.');
    }
    if (response.token_type && response.token_type.toLowerCase() !== 'bearer') {
      throw new Error('Tipo de token de autenticacion no compatible.');
    }
    if (response.expires_in != null &&
        (!Number.isFinite(response.expires_in) || response.expires_in <= 0)) {
      throw new Error('Respuesta de autenticacion invalida: expires_in.');
    }
    return {
      accessToken: response.access_token,
      user: response.usuario ?? null,
      apiKey: response.api_key ?? null,
      tokenType: response.token_type || 'bearer',
      expiresAt: response.expires_in == null ? null : Date.now() + response.expires_in * 1000,
    };
  }

  private canUseMockAuth(): boolean {
    return environment.useMockAuth && !environment.production;
  }

  private persistValue(key: string, value: unknown): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage unavailable; session still exists in memory.
    }
  }

  private persistText(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Storage unavailable; session still exists in memory.
    }
  }

  private readText(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  private readJson<T>(key: string): T | null {
    const raw = this.readText(key);

    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private removeValue(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // Ignore storage errors.
    }
  }
}
