import { HttpInterceptorFn } from '@angular/common/http';
import { filter } from 'rxjs';
import { inject } from '@angular/core';
import { ApiConfigService } from '../services/api-config.service';
import { AuthService } from '../auth/auth.service';
import { SKIP_AUTH_INTERCEPTOR } from '../auth/auth-http-context';

// ======================================================
// AUTH INTERCEPTOR
// Agrega Authorization Bearer a llamadas del backend.
// ======================================================
/** Adjunta Bearer solo a backends configurados, excluye el login y descarta exitos de generaciones anteriores.
 * @param req Solicitud Angular; respeta SKIP_AUTH_INTERCEPTOR.
 * @param next Siguiente interceptor.
 * @returns Flujo HTTP sin renovacion ni reintentos automaticos. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.context.get(SKIP_AUTH_INTERCEPTOR)) {
    return next(req);
  }

  const apiConfig = inject(ApiConfigService);

  if (!apiConfig.isBackendUrl(req.url)) {
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
