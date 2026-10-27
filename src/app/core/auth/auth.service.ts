import { HttpClient, HttpContext, HttpHeaders, HttpParams } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, Subject, defer, of, throwError } from 'rxjs';
import { catchError, takeUntil, tap, timeout } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { APP_PATHS } from '../constants/routes.constants';
import { STORAGE_KEYS } from '../constants/storage-keys.constants';
import { ApiConfigService } from '../services/api-config.service';
import {
  AuthSession,
  AuthUser,
  LoginResponse,
} from './auth.models';
import { CatalogosService } from './catalogos.service';
import { validarLogin } from './auth-response.validator';
import { SKIP_AUTH_INTERCEPTOR, SKIP_ERROR_INTERCEPTOR } from './auth-http-context';

// ======================================================
// ADVERTENCIA:
// AUTENTICACION MOCK UNICAMENTE PARA DESARROLLO.
// NO USAR EN PRODUCCION.
// ======================================================

@Injectable({
  providedIn: 'root',
})
/** Centraliza la sesion en memoria y el bootstrap. Depende de HttpClient, ApiConfigService, Router y CatalogosService.
 * No renueva ni revoca tokens remotamente; sus permisos activos siguen siendo codigos de texto. */
export class AuthService {
  /** Generacion de sesion para descartar respuestas de usuarios anteriores. */
  private generation = 0;
  private readonly sessionEnded = new Subject<void>();
  private readonly cleanups = new Set<() => void>();
  readonly loggingOut = signal(false);
  private logoutTask?: Promise<void>;
  /** Reservado para renovacion futura: solo memoria y nunca cabeceras HTTP. */
  private refreshToken: string | null = null;

  /** @returns Version local que permite descartar respuestas de una sesion anterior. */
  get sessionGeneration(): number { return this.generation; }

  /** Registra limpieza privada sin acoplar AuthService a los servicios operacionales. */
  /** @param cleanup Limpieza privada sin dependencias circulares.
   * @returns Funcion para retirar el registro al destruir su consumidor. */
  registerSessionCleanup(cleanup: () => void): () => void {
    this.cleanups.add(cleanup);
    return () => this.cleanups.delete(cleanup);
  }

  readonly currentUser = signal<AuthUser | null>(null);
  readonly accessToken = signal<string | null>(null);
  readonly apiKey = signal<string | null>(null);
  readonly expiresAt = signal<number | null>(null);

  constructor(
    private readonly http: HttpClient,
    private readonly apiConfig: ApiConfigService,
    private readonly router: Router,
    private readonly catalogos: CatalogosService,
  ) {
    // No se restaura el contrato anterior ni tokens persistidos sin soporte del backend.
    this.clearSession(false);
  }

  /** Ejecuta solo al suscribirse; cancela el intento anterior y valida el bootstrap completo.
   * @param usuario Identificador enviado como username; no se persiste.
   * @param password Credencial enviada en formulario; no se registra ni se conserva en sesion.
   * @returns Observable de LoginResponse; propaga errores HTTP, timeout o contrato invalido. */
  login(usuario: string, password: string): Observable<LoginResponse> {
    return defer(() => {
      if (this.loggingOut()) return throwError(() => new Error('Cierre de sesion en curso.'));
      // Solo el intento mas reciente puede establecer una sesion.
      this.sessionEnded.next();
      const request = this.canUseMockAuth() ? this.loginWithMock(usuario, password) : this.loginWithBackend(usuario, password);
      // Una respuesta de login tardia no puede recrear credenciales despues de SALIR.
      return request.pipe(takeUntil(this.sessionEnded));
    });
  }

  /** Limpieza inmediata e idempotente; /login es la pantalla publica inicial existente. */
  /** @returns Promesa compartida hasta terminar la redireccion. Solo confirma cierre local, no revocacion remota. */
  logout(): Promise<void> {
    if (this.loggingOut()) return this.logoutTask ?? Promise.resolve();
    this.loggingOut.set(true);
    this.clearSession();
    this.clearAuthenticationCookies();
    this.logoutTask = this.router.navigateByUrl(APP_PATHS.LOGIN, { replaceUrl: true })
      .then(navigated => {
        if (!navigated) console.warn('La sesion local se cerro, pero la navegacion publica fue cancelada.');
      })
      .catch(() => { console.warn('La sesion local se cerro, pero fallo la navegacion publica.'); })
      .finally(() => { this.loggingOut.set(false); this.logoutTask = undefined; });
    return this.logoutTask;
  }

  /** Comprueba expira_en convertido a fecha absoluta al autenticar.
   * @returns Si existe access token no vencido; no verifica firma JWT ni consulta al servidor. */
  isAuthenticated(): boolean {
    const expiry = this.expiresAt();
    if (expiry !== null && Date.now() >= expiry) {
      this.clearSession();
    }
    return !!this.accessToken();
  }

  /** @returns Access token vigente o null tras limpiar una sesion vencida. Nunca retorna el refresh token. */
  getToken(): string | null {
    return this.isAuthenticated() ? this.accessToken() : null;
  }

  /** @returns Clave de compatibilidad; el contrato bootstrap actual no la entrega y permanece nula. */
  getApiKey(): string | null {
    return this.apiKey();
  }

  /** @returns Usuario en memoria; consultar autenticacion para evaluar tambien la expiracion. */
  getCurrentUser(): AuthUser | null {
    return this.currentUser();
  }

  /** @returns Rol informado por el bootstrap, sin inferir asignaciones del catalogo. */
  getRole(): string | null {
    return this.currentUser()?.rol ?? null;
  }

  /** @returns El mismo usuario centralizado, sin mantener una copia de estado adicional. */
  obtenerUsuario(): AuthUser | null { return this.getCurrentUser(); }
  /** @returns Nombres y apellidos para los consumidores visuales; cadena vacia sin usuario. */
  obtenerNombreCompleto(): string {
    const u = this.currentUser();
    return u ? `${u.nombres} ${u.apellidos}`.trim() : '';
  }
  /** @returns Alias de getRole para consumidores en espanol. */
  obtenerRol(): string | null { return this.getRole(); }
  /** @returns Copia de los codigos asignados al usuario; no incluye el catalogo general. */
  obtenerPermisos(): string[] { return [...(this.currentUser()?.permisos ?? [])]; }
  /** Regla operativa actual por codigo; no incorpora la politica numerica preparada.
   * @param codigo Codigo textual asignado.
   * @returns Si la sesion es valida y la lista contiene el codigo, incluso para administradores. */
  tienePermiso(codigo: string): boolean { return this.isAuthenticated() && this.obtenerPermisos().includes(codigo); }
  /** @param rol Nombre exacto esperado.
   * @returns Si el rol coincide en una sesion vigente; no concede permisos adicionales. */
  tieneRol(rol: string): boolean { return this.isAuthenticated() && this.getRole() === rol; }
  /** Resuelve media relativa contra el origen configurado, sin duplicar /api/auth. */
  /** @returns URL HTTP(S) de fotografia o null; sin fotografia se conserva la representacion predeterminada. */
  obtenerFotoUsuario(): string | null {
    const foto = this.currentUser()?.foto_url;
    if (!foto) return null;
    try {
      const base = new URL(this.apiConfig.authBaseUrl, location.origin);
      const url = new URL(foto, base.origin + '/');
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch { return null; }
  }

  private loginWithMock(usuario: string, password: string): Observable<LoginResponse> {
    if (usuario !== 'admin' || password !== 'admin123') {
      return throwError(() => new Error('Usuario o contrasena incorrectos.'));
    }

    const response: LoginResponse = {
      access_token: 'TEMP_TOKEN',
      tipo_token: 'bearer', refresh_token: 'TEMP_REFRESH_TOKEN', expira_en: 1500,
      catalogos: { tipos_unidad: [], unidades: [], estados_operacionales: [], estados_logisticos: [], permisos: [] },
      usuario: {
        id: 1,
        nombres: 'admin', apellidos: '', grado: '', email_institucional: '',
        permisos: [], documentos_aprobados: false, foto_url: null,
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
          // Conserva el error de este login; no cancela su propia notificacion.
          this.clearSession(false, false);
          return throwError(() => error);
        }),
      );
  }

  /** Publica el access token despues de copiar los catalogos; no escribe credenciales en almacenamiento web. */
  private applySession(session: AuthSession): void {
    // Cargar primero los catalogos evita una sesion parcial si su lectura falla.
    this.catalogos.cargar(session.catalogos);
    ++this.generation;
    this.currentUser.set(session.user);
    this.refreshToken = session.refreshToken;
    this.expiresAt.set(session.expiresAt);
    this.accessToken.set(session.accessToken);
    this.apiKey.set(null);
  }

  /** Invalida respuestas pendientes, memoria, claves propias y caches privadas registradas. */
  private clearSession(redirectToLogin = false, cancelPending = true): void {
    ++this.generation;
    this.refreshToken = null;
    this.catalogos.limpiar();
    this.currentUser.set(null);
    this.accessToken.set(null);
    this.apiKey.set(null);
    this.expiresAt.set(null);

    this.removeValue(STORAGE_KEYS.user);
    this.removeValue(STORAGE_KEYS.accessToken);
    this.removeValue(STORAGE_KEYS.apiKey);
    this.removeValue(STORAGE_KEYS.expiresAt);
    if (cancelPending) this.sessionEnded.next();

    for (const cleanup of this.cleanups) {
      try { cleanup(); } catch { console.warn('No se pudo completar una limpieza privada de VULCANO.'); }
    }

    if (redirectToLogin) {
      void this.router.navigateByUrl(APP_PATHS.LOGIN, { replaceUrl: true });
    }
  }

  /** Valida antes de construir la sesion. La expiracion proviene de expira_en, no de claims JWT decodificados. */
  private mapLoginResponse(response: LoginResponse): AuthSession {
    validarLogin(response);
    return {
      accessToken: response.access_token, refreshToken: response.refresh_token,
      user: structuredClone(response.usuario), catalogos: response.catalogos,
      expiresAt: Date.now() + response.expira_en * 1000,
    };
  }

  private canUseMockAuth(): boolean {
    return environment.useMockAuth && !environment.production;
  }

  /** Elimina solo claves de autenticacion VULCANO en ambos almacenamientos. */
  private removeValue(key: string): void {
    for (const type of ['localStorage', 'sessionStorage'] as const) {
      try { window[type].removeItem(key); }
      catch { console.warn(`No se pudo eliminar una clave de autenticacion de ${type}.`); }
    }
  }

  /** Solo cookies visibles con nombres propios conocidos; HttpOnly requiere al servidor. */
  private clearAuthenticationCookies(): void {
    const names = new Set<string>(Object.values(STORAGE_KEYS));
    const paths = new Set(['/', '/api', '/api/auth']);
    const segments = location.pathname.split('/').filter(Boolean);
    for (let i = 1; i <= segments.length; i++) paths.add('/' + segments.slice(0, i).join('/'));
    try {
      for (const part of document.cookie.split(';')) {
        const name = part.trim().split('=')[0];
        if (!names.has(name)) continue;
        for (const path of paths) {
          document.cookie = `${name}=; Max-Age=0; Path=${path}; SameSite=Lax`;
        }
      }
    } catch { console.warn('No fue posible limpiar cookies de autenticacion accesibles.'); }
  }
}
