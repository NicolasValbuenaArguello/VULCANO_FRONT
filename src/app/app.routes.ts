import { Routes } from '@angular/router';
import { APP_PATHS, APP_ROUTES } from './core/constants/routes.constants';
import { authGuard } from './core/auth/auth.guard';
import { guestGuard } from './core/auth/guest.guard';
import { AppShell } from './layout/app-shell';

export const routes: Routes = [
  {
    path: APP_ROUTES.TERRAIN_TEST,
    loadComponent: () =>
      import('./pages/terrain-minimal-test/terrain-minimal-test').then((m) => m.TerrainMinimalTest),
  },
  {
    path: APP_ROUTES.LOGIN,
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    component: AppShell,
    canActivateChild: [authGuard],
    children: [
      { path: 'gis-poligonos', loadComponent: () => import('./pages/gis-poligonos/gis-poligonos').then(m => m.GisPoligonos) },
      {
        path: '',
        pathMatch: 'full',
        redirectTo: APP_ROUTES.HOME,
      },
      {
        path: APP_ROUTES.HOME,
        loadComponent: () => import('./pages/home/home').then((m) => m.Home),
      },
      {
        path: APP_ROUTES.INGRESO,
        loadComponent: () => import('./pages/ingreso/ingreso').then((m) => m.Ingreso),
      },
      {
        path: APP_ROUTES.PERMISOS,
        loadComponent: () => import('./pages/permisos/permisos').then((m) => m.Permisos),
      },
      {
        path: APP_ROUTES.VULCANO,
        loadComponent: () => import('./pages/vulcano/vulcano').then((m) => m.Vulcano),
      },
      {
        path: APP_ROUTES.VULCANOLOG,
        loadComponent: () => import('./pages/vulano-log/vulano-log').then((m) => m.VulanoLog),
      },
      {
        path: '**',
        redirectTo: APP_ROUTES.HOME,
      },
    ],
  },
  {
    path: '**',
    redirectTo: APP_PATHS.HOME,
  },
];
