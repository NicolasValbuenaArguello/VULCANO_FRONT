import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { ApiConfigService } from '../services/api-config.service';
import { AuthService } from '../auth/auth.service';
import { SKIP_ERROR_INTERCEPTOR } from '../auth/auth-http-context';

// ======================================================
// ERROR INTERCEPTOR
// Centraliza manejo de errores HTTP del backend.
// ======================================================
/** Un 401 protegido de la sesion actual solicita logout local; 403 conserva la sesion.
 * @param req Solicitud de origen; respeta SKIP_ERROR_INTERCEPTOR y limites del backend.
 * @param next Siguiente manejador HTTP.
 * @returns Flujo que propaga los errores; no intenta refresh. */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.context.get(SKIP_ERROR_INTERCEPTOR)) {
    return next(req);
  }

  const apiConfig = inject(ApiConfigService);
  const authService = inject(AuthService);
  const generation = authService.sessionGeneration;

  return next(req).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) {
        return throwError(() => error);
      }

      if (!apiConfig.isBackendUrl(req.url)) {
        return throwError(() => error);
      }

      if (error.status === 401 && !apiConfig.isLoginEndpoint(req.url) && generation === authService.sessionGeneration) {
        void authService.logout();
        return throwError(() => error);
      }

      if (error.status === 403) {
        console.warn('Acceso prohibido (403) en', req.url);
        return throwError(() => error);
      }

      if (error.status >= 500) {
        console.error('Error del servidor en', req.url, error);
      }

      return throwError(() => error);
    }),
  );
};
