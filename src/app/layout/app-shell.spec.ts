import { loginFixture } from '../core/auth/auth-test.fixture';
import { CatalogosService } from '../core/auth/catalogos.service';
﻿import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { Location } from '@angular/common';
import { SpyLocation, provideLocationMocks } from '@angular/common/testing';
import { RouterTestingHarness } from '@angular/router/testing';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../core/auth/auth.service';
import { authGuard } from '../core/auth/auth.guard';
import { guestGuard } from '../core/auth/guest.guard';
import { authInterceptor } from '../core/interceptors/auth.interceptor';
import { errorInterceptor } from '../core/interceptors/error.interceptor';
import { STORAGE_KEYS } from '../core/constants/storage-keys.constants';
import { AppShell } from './app-shell';
import { MeasurementService } from '../shared/components/geographic-measurement/measurement.service';
import { IconosService } from '../shared/services/iconos.service';
import { PuntosDemoService } from '../shared/services/puntos-demo.service';

@Component({ selector: 'test-protected-page', standalone: true, template: '<p>Contenido protegido</p>' })
class ProtectedPage {}
@Component({ selector: 'test-public-page', standalone: true, template: '<p>Inicio publico</p>' })
class PublicPage {}

/** Usa guards y shell reales con paginas minimas para aislar el flujo de sesion. */
describe('Logout with protected shell', () => {
  afterEach(() => { for (const key of Object.values(STORAGE_KEYS)) localStorage.removeItem(key); });
  it('destroys private views, clears tools and gives a second user an empty private cache', async () => {
    for (const key of Object.values(STORAGE_KEYS)) localStorage.removeItem(key);
    TestBed.configureTestingModule({ providers: [
      provideLocationMocks(),
      provideRouter([
        { path: 'login', component: PublicPage, canActivate: [guestGuard] },
        { path: '', component: AppShell, canActivateChild: [authGuard], children: [
          { path: 'home', component: ProtectedPage },
          { path: 'vulcano', component: ProtectedPage },
        ] },
      ]),
      provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])), provideHttpClientTesting(),
    ] });
    const auth = TestBed.inject(AuthService);
    const http = TestBed.inject(HttpTestingController);
    async function login(name: string) {
      const request = firstValueFrom(auth.login(name, 'password'));
      http.expectOne('/api/auth/token').flush(loginFixture(name, name + '-jwt'));
      await request;
    }
    await login('first');
    const harness = await RouterTestingHarness.create('/home');
    const oldShell = harness.routeDebugElement!.componentInstance;
    const oldCache = harness.routeDebugElement!.injector.get(PuntosDemoService);
    const measurements = TestBed.inject(MeasurementService);
    measurements.start('route'); measurements.addPoint({ latitud: 4, longitud: -74 });
    const icons = TestBed.inject(IconosService);
    icons.seleccionarIcono(icons.catalogoIconos[0]);
    const demoRequest = firstValueFrom(oldCache.cargar());
    http.expectOne('/api/demo-points').flush([{ id: 'first-private', name: 'Private', category: 'punto', x: 1, y: 2, created_at: '2026-10-23T00:00:00Z' }]);
    await demoRequest;
    expect(oldCache.registros()).toHaveLength(1);
    await harness.navigateByUrl('/vulcano');
    const exit = [...harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('button')]
      .find(button => button.textContent?.trim() === 'Salir')!;
    exit.click();
    await auth.logout();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/login');
    expect(harness.routeNativeElement!.textContent).toContain('Inicio publico');
    expect(measurements.draft()).toEqual([]);
    expect(measurements.measurements()).toEqual([]);
    expect(icons.obtenerIconoSeleccionado()).toBeNull();
    // Simula el evento popstate de volver a una URL protegida del historial.
    (TestBed.inject(Location) as SpyLocation).simulateUrlPop('/home');
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/login');
    // Un intento directo o equivalente a volver a una URL anterior vuelve a pasar por el guard.
    await harness.navigateByUrl('/home');
    expect(TestBed.inject(Router).url).toBe('/login?returnUrl=%2Fhome');
    await harness.navigateByUrl('/vulcano');
    expect(TestBed.inject(Router).url).toBe('/login?returnUrl=%2Fvulcano');
    await login('second');
    await harness.navigateByUrl('/home');
    expect(harness.routeDebugElement!.componentInstance).not.toBe(oldShell);
    const freshCache = harness.routeDebugElement!.injector.get(PuntosDemoService);
    expect(freshCache).not.toBe(oldCache);
    expect(freshCache.registros()).toEqual([]);
    expect(auth.getCurrentUser()?.nombres).toBe('second');
    http.verify();
  });
});
