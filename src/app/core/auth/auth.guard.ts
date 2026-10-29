import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { AuthService } from './auth.service';
import { APP_PATHS } from '../constants/routes.constants';

// ======================================================
// AUTH GUARD
// Protege rutas que requieren una sesion valida.
// ======================================================
/** Conserva la URL solicitada para continuar tras login, sin conceder acceso sin token vigente.
 * @param _route Ruta evaluada por Angular.
 * @param state Incluye URL interna completa (consulta y fragmento).
 * @returns true con sesion vigente o UrlTree al login; no controla permisos por funcion.
 * Depende de AuthService y Router; no intenta refresh sin contrato del backend. */
export const authGuard: CanActivateFn = (_route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  return authService.isAuthenticated()
    ? true
    : router.createUrlTree([APP_PATHS.LOGIN], { queryParams: { returnUrl: state.url } });
};
