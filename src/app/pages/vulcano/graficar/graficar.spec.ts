import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { loaderInterceptor } from '../../../core/interceptors/loader.interceptor';
import { LoaderService } from '../../../core/services/loader.service';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { MapaElementosService } from '../../../shared/services/mapa-elementos.service';
import { Graficar } from './graficar';

describe('Graficar', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [Graficar],
    providers: [provideHttpClient(withInterceptors([loaderInterceptor])), provideHttpClientTesting()],
  }));

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('keeps the existing form without demo controls', () => {
    const fixture = TestBed.createComponent(Graficar);
    fixture.detectChanges();

    expect(fixture.nativeElement.querySelector('.coordinates-grid')).not.toBeNull();
    expect(fixture.nativeElement.querySelectorAll('section.panel')).toHaveLength(4);
    expect(fixture.nativeElement.querySelector('.action-button--primary').textContent).toContain('Graficar');
  });

  it('posts converted DMS values and draws only after a confirmed response', async () => {
    const fixture = TestBed.createComponent(Graficar);
    const component = fixture.componentInstance;
    const mapa = TestBed.inject(MapaElementosService);
    const publish = vi.spyOn(mapa, 'agregarElemento');
    const emit = vi.spyOn(component.graficarElemento, 'emit');
    const coordinateEmit = vi.spyOn(component.coordenadaRegistrada, 'emit');

    component.latitud = { grados: 3, minutos: 25, segundos: 30, decimal: null };
    component.longitud = { grados: 75, minutos: 25, segundos: 30, decimal: null };
    component.hemisferioLatitud = 'LN';
    component.hemisferioLongitud = 'LW';
    component.configuracion1 = 'Pieza';
    component.configuracion2 = 'Prueba pieza';
    component.iconoSeleccionado = 'generic-test-icon';
    component.onCoordenadaChange('latitud');
    component.onCoordenadaChange('longitud');

    const request = component.graficar();
    expect(TestBed.inject(LoaderService).pendingRequests()).toBe(1);
    const http = TestBed.inject(HttpTestingController);
    const post = http.expectOne('/api/coordenadas/registrar');
    expect(post.request.method).toBe('POST');
    expect(post.request.body).toEqual({
      tipo_graficacion: 'Pieza',
      nombre: 'Prueba pieza',
      latitud: { hemisferio: 'N', grados: 3, minutos: 25, segundos: 30 },
      longitud: { hemisferio: 'W', grados: 75, minutos: 25, segundos: 30 },
    });
    expect(publish).not.toHaveBeenCalled();

    post.flush({
      ok: true,
      mensaje: 'Registro guardado correctamente',
      registro: { id: 'p1', tipo_graficacion: 'Pieza', nombre: 'Prueba pieza', latitud: 3.425, longitud: -75.425 },
    });
    await request;
    expect(TestBed.inject(LoaderService).pendingRequests()).toBe(0);

    expect(publish).toHaveBeenCalledOnce();
    expect(emit).toHaveBeenCalledOnce();
    expect(publish.mock.calls[0][0]).toMatchObject({ latitud: 3.425, longitud: -75.425 });
    expect(publish.mock.calls[0][0].idTemporal).toBe('p1');
    expect(coordinateEmit).toHaveBeenCalledWith({
      id: 'p1', tipo_graficacion: 'Pieza', nombre: 'Prueba pieza', latitud: 3.425, longitud: -75.425,
      icono: 'generic-test-icon', icono_id: undefined,
    });
  });

  it('does not draw when the backend returns non-finite coordinates', async () => {
    const fixture = TestBed.createComponent(Graficar);
    const component = fixture.componentInstance;
    const mapa = TestBed.inject(MapaElementosService);
    const publish = vi.spyOn(mapa, 'agregarElemento');
    vi.spyOn(window, 'alert').mockImplementation(() => {});

    component.latitud = { grados: 3, minutos: 25, segundos: 30, decimal: 3.425 };
    component.longitud = { grados: 75, minutos: 25, segundos: 30, decimal: -75.425 };
    component.configuracion1 = 'Pieza';
    component.configuracion2 = 'Prueba pieza';
    component.iconoSeleccionado = 'generic-test-icon';

    const request = component.graficar();
    TestBed.inject(HttpTestingController).expectOne('/api/coordenadas/registrar').flush({
      ok: true,
      mensaje: 'Coordenadas invalidas',
      registro: { latitud: 'NaN', longitud: -75.425 },
    });
    await request;

    expect(publish).not.toHaveBeenCalled();
  });
});
