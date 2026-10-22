import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';
import { APP_PATHS } from '../constants/routes.constants';

// ======================================================
// AUTH GUARD
// Protege rutas que requieren una sesion valida.
// ======================================================
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.isAuthenticated()
    ? true
    : router.createUrlTree([APP_PATHS.LOGIN]);
};
