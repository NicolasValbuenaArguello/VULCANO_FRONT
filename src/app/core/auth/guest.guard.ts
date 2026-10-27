import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';
import { APP_PATHS } from '../constants/routes.constants';

// ======================================================
// GUEST GUARD
// Protege rutas que deben abrir solo sin sesion activa.
// ======================================================
/** @returns Acceso publico sin sesion o UrlTree a Home con sesion vigente; evita volver al login autenticado. */
export const guestGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.isAuthenticated()
    ? router.createUrlTree([APP_PATHS.HOME])
    : true;
};
