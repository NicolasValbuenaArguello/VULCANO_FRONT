import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { ApiConfigService } from '../services/api-config.service';
import { AuthService } from '../auth/auth.service';
import { SKIP_AUTH_INTERCEPTOR } from '../auth/auth-http-context';

// ======================================================
// AUTH INTERCEPTOR
// Agrega Authorization Bearer a llamadas del backend.
// ======================================================
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
    }),
  );
};
