import { TestBed } from '@angular/core/testing';
import * as L from 'leaflet';
import { MapActionsService } from './map-actions.service';
import { MapaComponent } from '../mapa/mapa';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HojaMilimetradaComponent } from '../../../pages/vulcano/hoja-milimetrada/hoja-milimetrada.component';
import { MapaTresD } from '../../../pages/vulcano/mapa-tres-d/mapa-tres-d';
import { vi } from 'vitest';
import { IconosService } from '../../services/iconos.service';

describe('Map context menu', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }));
  it('uses Leaflet coordinates and emits one explicit action without creating elements', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const map = L.map(host).setView([4, -74], 6);
    const component = TestBed.runInInjectionContext(() => new MapaComponent()) as any;
    component.map = map;
    component.bindMapEvents();
    const service = TestBed.inject(MapActionsService);
    const actions: unknown[] = [];
    service.requested$.subscribe(action => actions.push(action));
    const event = new MouseEvent('contextmenu', { clientX: 50, clientY: 60, cancelable: true });
    map.fire('contextmenu', { latlng: L.latLng(-3.456789123, 75.123456789), originalEvent: event });
    expect(event.defaultPrevented).toBe(true);
    expect(service.selectedPoint()).toEqual({ latitud: -3.456789123, longitud: 75.123456789 });
    expect(host.querySelectorAll('[role="menuitem"]')).toHaveLength(2);
    expect(actions).toHaveLength(0);
    host.querySelector<HTMLButtonElement>('button')!.click();
    expect(actions).toEqual([{ action: 'graficar', point: { latitud: -3.456789123, longitud: 75.123456789 }, host }]);
    expect(host.querySelector('[role="menu"]')).toBeNull();
    service.close();
    map.remove();
    host.remove();
  });

  it('rejects invalid coordinates, closes with ESC/outside/movement and keeps a single menu', () => {
    const service = TestBed.inject(MapActionsService);
    const host = document.createElement('div');
    document.body.append(host);
    const event = () => new MouseEvent('contextmenu', { clientX: 10, clientY: 10, cancelable: true });
    for (const point of [{ latitud: NaN, longitud: 0 }, { latitud: 91, longitud: 0 }, { latitud: 0, longitud: Infinity }]) {
      service.open(host, point, event());
      expect(host.querySelector('[role="menu"]')).toBeNull();
    }
    service.open(host, { latitud: 4, longitud: -74 }, event());
    service.open(host, { latitud: 5, longitud: -75 }, event());
    expect(host.querySelectorAll('[role="menu"]')).toHaveLength(1);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(host.querySelector('[role="menu"]')).toBeNull();
    service.open(host, { latitud: 4, longitud: -74 }, event());
    document.dispatchEvent(new Event('pointerdown'));
    expect(host.querySelector('[role="menu"]')).toBeNull();
    service.open(host, { latitud: 4, longitud: -74 }, event());
    service.closeFor(host);
    expect(host.querySelector('[role="menu"]')).toBeNull();
    host.remove();
  });
});

describe('Projection from map coordinates', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [HojaMilimetradaComponent], providers: [provideHttpClient(), provideHttpClientTesting()],
  }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('uses MapLibre surface intersection and unproject, rejecting sky and preserving right-drag events', () => {
    const component = TestBed.runInInjectionContext(() => new MapaTresD()) as any;
    const service = TestBed.inject(MapActionsService);
    const host = document.createElement('div');
    document.body.append(host);
    const surface = vi.fn(() => true);
    const unproject = vi.fn(() => ({ lat: -3.456789123, lng: 75.123456789 }));
    const map = { getContainer: () => host, transform: { isPointOnMapSurface: surface }, terrain: {}, unproject };
    component.map = map;
    const point = { x: 23, y: 45 };
    const event = { point, originalEvent: new MouseEvent('contextmenu', { cancelable: true }), defaultPrevented: false };
    component.handleMapContextMenu(event);
    expect(surface).toHaveBeenCalledWith(point, map.terrain);
    expect(unproject).toHaveBeenCalledWith(point);
    expect(service.selectedPoint()).toEqual({ latitud: -3.456789123, longitud: 75.123456789 });
    expect(host.querySelector('[role="menu"]')).not.toBeNull();
    service.close();
    surface.mockReturnValue(false);
    unproject.mockClear();
    component.handleMapContextMenu(event);
    expect(unproject).not.toHaveBeenCalled();
    expect(host.querySelector('[role="menu"]')).toBeNull();
    surface.mockReturnValue(true);
    component.handleMapContextMenu({ ...event, defaultPrevented: true });
    expect(unproject).not.toHaveBeenCalled();
    component.map = null;
    host.remove();
  });

  it('moves the existing modal to the map and changes only its origin when requested again', async () => {
    const fixture = TestBed.createComponent(HojaMilimetradaComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const host = document.createElement('div');
    document.body.append(host);
    const component = fixture.componentInstance;
    component.abrirProyeccionDesdeMapa({ latitud: -3.456789123, longitud: 75.123456789 }, host);
    fixture.detectChanges();
    const modal = host.querySelector('.project-modal');
    expect(modal).not.toBeNull();
    expect(component.elementoProyectar()?.latitud).toBe(-3.456789123);
    expect(component.elementoProyectar()?.longitud).toBe(75.123456789);
    expect(component.elements).toHaveLength(0);
    component.distanciaProyeccion = '1200';
    component.azimutProyeccion = 45;
    component.nombreProyeccion = 'Nombre conservado';
    component.abrirProyeccionDesdeMapa({ latitud: 4.123456789, longitud: -74.987654321 }, host);
    fixture.detectChanges();
    expect(host.querySelector('.project-modal')).toBe(modal);
    expect(host.querySelectorAll('.project-modal')).toHaveLength(1);
    expect(component.distanciaProyeccion).toBe('1200');
    expect(component.azimutProyeccion).toBe(45);
    expect(component.nombreProyeccion).toBe('Nombre conservado');
    expect(component.elementoProyectar()?.latitud).toBe(4.123456789);
    TestBed.inject(HttpTestingController).expectNone(() => true);
    component.cerrarVentanaProyectar();
    fixture.detectChanges();
    expect(host.querySelector('.project-modal')).toBeNull();
    expect(fixture.nativeElement.querySelector('.project-modal')).toBeNull();
    fixture.destroy();
    host.remove();
  });

  it('uses the captured origin in the existing projection and posts only after confirmation', async () => {
    const fixture = TestBed.createComponent(HojaMilimetradaComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const host = document.createElement('div');
    document.body.append(host);
    const component = fixture.componentInstance;
    component.abrirProyeccionDesdeMapa({ latitud: 4, longitud: -74 }, host);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectNone(() => true);
    const icons = TestBed.inject(IconosService);
    icons.seleccionarIcono(icons.catalogoIconos[0]);
    component.distanciaProyeccion = '1000';
    component.azimutProyeccion = 0;
    component.tipoGraficacionProyeccion = 'Pieza';
    component.nombreProyeccion = 'Proyeccion desde mapa';
    const confirmation = component.proyectarElemento();
    const request = http.expectOne('/api/coordenadas/registrar');
    expect(request.request.method).toBe('POST');
    expect(request.request.body.nombre).toBe('Proyeccion desde mapa');
    expect(request.request.body.latitud.hemisferio).toBe('N');
    expect(request.request.body.latitud.grados).toBe(4);
    expect(request.request.body.latitud.segundos).toBeGreaterThan(0);
    expect(request.request.body.longitud.hemisferio).toBe('W');
    expect(request.request.body.longitud.grados).toBe(74);
    request.flush({ ok: true, mensaje: 'OK', registro: { id: 'projected', latitud: 4.009, longitud: -74 } });
    await confirmation;
    fixture.detectChanges();
    expect(component.elementoProyectar()).toBeNull();
    expect(host.querySelector('.project-modal')).toBeNull();
    fixture.destroy();
    host.remove();
  });
});
