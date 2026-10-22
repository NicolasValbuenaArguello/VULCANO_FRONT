import { Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';

type BackendMap = Partial<Record<'auth' | 'vulcano' | 'usuarios' | 'archivos' | 'operaciones', string>>;

@Injectable({
  providedIn: 'root',
})
export class ApiConfigService {
  private readonly fallbackAuthBaseUrl = environment.api.auth;

  get authBaseUrl(): string {
    return this.getApiBaseUrl('auth');
  }

  get usuariosBaseUrl(): string {
    return this.getApiBaseUrl('usuarios');
  }

  get archivosBaseUrl(): string {
    return this.getApiBaseUrl('archivos');
  }

  get operacionesBaseUrl(): string {
    return this.getApiBaseUrl('operaciones');
  }

  get loginUrl(): string {
    return this.joinUrl(this.authBaseUrl, environment.endpoints.login);
  }

  get logoutUrl(): string {
    return this.joinUrl(this.authBaseUrl, environment.endpoints.logout);
  }

  get refreshTokenUrl(): string {
    return this.joinUrl(this.authBaseUrl, environment.endpoints.refreshToken);
  }

  isBackendUrl(url: string): boolean {
    const candidates = this.getBackendBases();
    return candidates.some((baseUrl) => this.matchesBaseUrl(url, baseUrl));
  }

  isAuthEndpoint(url: string): boolean {
    return [this.loginUrl, this.logoutUrl, this.refreshTokenUrl].some((endpoint) =>
      this.matchesBaseUrl(url, endpoint),
    );
  }

  isLoginEndpoint(url: string): boolean {
    return this.matchesBaseUrl(url, this.loginUrl);
  }

  getApiBaseUrl(service: keyof BackendMap): string {
    const configuredBase = this.getBackendMap()[service];
    return configuredBase?.trim() || this.fallbackAuthBaseUrl;
  }

  private getBackendMap(): BackendMap {
    return (environment.api ?? {}) as BackendMap;
  }

  private getBackendBases(): string[] {
    const map = this.getBackendMap();
    return [map.auth, map.vulcano, map.usuarios, map.archivos, map.operaciones, environment.api.auth]
      .filter((value): value is string => !!value?.trim())
      .map((value) => value.trim());
  }

  joinUrl(baseUrl: string, path: string): string {
    const normalizedBase = baseUrl.replace(/\/+$/, '');
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    return `${normalizedBase}${normalizedPath}`;
  }

  private matchesBaseUrl(url: string, baseUrl: string): boolean {
    try {
      const origin = globalThis.location?.origin ?? 'http://localhost';
      const request = new URL(url, origin);
      const base = new URL(baseUrl, origin);
      const path = base.pathname.replace(/\/+$/, '');
      return request.origin === base.origin &&
        (request.pathname === path || request.pathname.startsWith(path + '/'));
    } catch {
      return false;
    }
  }
}
