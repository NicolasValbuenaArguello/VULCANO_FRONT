import { HttpInterceptorFn } from '@angular/common/http';
import { filter } from 'rxjs';
import { inject } from '@angular/core';
import { ApiConfigService } from '../services/api-config.service';
import { AuthService } from '../auth/auth.service';
import { GIS_AUTH_DIAGNOSTIC, SKIP_AUTH_INTERCEPTOR } from '../auth/auth-http-context';
import { environment } from '../../../environments/environment';

// ======================================================
// AUTH INTERCEPTOR
// Agrega Authorization Bearer a llamadas del backend.
// ======================================================
/** Adjunta Bearer solo a backends configurados, excluye el login y descarta exitos de generaciones anteriores.
 * @param req Solicitud Angular; respeta SKIP_AUTH_INTERCEPTOR.
 * @param next Siguiente interceptor.
 * @returns Flujo HTTP sin renovacion ni reintentos automaticos. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const apiConfig = inject(ApiConfigService);
  const backendReconocido = apiConfig.isBackendUrl(req.url);
  const interceptorOmitido = req.context.get(SKIP_AUTH_INTERCEPTOR);
  let diagnosticar = (_authorizationAdjuntada: boolean): void => {};
  if (!environment.production && req.context.get(GIS_AUTH_DIAGNOSTIC)) {
    let url: URL | null = null;
    try { url = new URL(req.url, location.origin); } catch { /* No altera el manejo de URLs invalidas. */ }
    if (url && url.origin === location.origin && (url.pathname === '/api/coordenadas/limites-seguridad' ||
      url.pathname.startsWith('/api/coordenadas/limites-seguridad/'))) {
      const auth = inject(AuthService);
      // Solo lectura de signals: el diagnostico no renueva, limpia ni decodifica JWT.
      const tokenPresente = !!auth.accessToken();
      const expiry = auth.expiresAt();
      const estadoSesion = auth.loggingOut() ? 'cerrando' :
        expiry !== null && Date.now() >= expiry ? 'vencida' : tokenPresente ? 'vigente-local' : 'ausente';
      const safeUrl = url.origin + url.pathname;
      diagnosticar = authorizationAdjuntada => console.debug('[GIS AUTH]', {
        url: safeUrl, backendReconocido, interceptorOmitido,
        tokenPresente, authorizationAdjuntada, estadoSesion,
      });
    }
  }
  if (interceptorOmitido) {
    diagnosticar(req.headers.has('Authorization'));
    return next(req);
  }
  if (!backendReconocido) {
    diagnosticar(req.headers.has('Authorization'));
    return next(req);
  }

  const authService = inject(AuthService);
  const token = authService.getToken();
  const apiKey = authService.getApiKey();
  const generation = authService.sessionGeneration;

  let headers = req.headers;

  if (token && !apiConfig.isLoginEndpoint(req.url)) {
    headers = headers.set('Authorization', `Bearer ${token}`);
  }

  if (apiKey) {
    headers = headers.set('X-API-Key', apiKey);
  }
  diagnosticar(headers.has('Authorization'));

  return next(
    req.clone({
      headers,
      // Las respuestas del backend pueden ser privadas; no reutilizar cache HTTP entre usuarios.
      // Los proveedores externos de teselas no pasan por esta rama.
      cache: 'no-store',
    }),
  ).pipe(
    // Una respuesta exitosa anterior a SALIR no debe repoblar estados privados.
    filter(() => generation === authService.sessionGeneration),
  );
};
