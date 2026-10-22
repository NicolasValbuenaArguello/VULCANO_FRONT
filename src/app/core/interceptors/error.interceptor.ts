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
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.context.get(SKIP_ERROR_INTERCEPTOR)) {
    return next(req);
  }

  const apiConfig = inject(ApiConfigService);
  const authService = inject(AuthService);

  return next(req).pipe(
    catchError((error: unknown) => {
      if (!(error instanceof HttpErrorResponse)) {
        return throwError(() => error);
      }

      if (!apiConfig.isBackendUrl(req.url)) {
        return throwError(() => error);
      }

      if (error.status === 401 && !apiConfig.isLoginEndpoint(req.url)) {
        authService.logout();
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
