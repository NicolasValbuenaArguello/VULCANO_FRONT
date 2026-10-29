import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { HojaMilimetradaComponent } from './hoja-milimetrada.component';
import { VentanaPuntos } from '../ventana-puntos/ventana-puntos';
import { GeographicPointsService } from '../../../shared/geographic-points/geographic-points';
import { localPointRemoteFixture } from '../../../shared/geographic-points/point-remote-test.fixture';

describe('PUNTOS compartidos en hoja milimetrada', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting(), localPointRemoteFixture] });
    vi.spyOn(console, 'debug').mockImplementation(() => {});
  });
  afterEach(() => { TestBed.inject(HttpTestingController).verify(); vi.restoreAllMocks(); });

  it('projects plotted records through the existing metric CRS and retains them through navigation, editing and window recreation', async () => {
    const sheet = TestBed.createComponent(HojaMilimetradaComponent);
    const window = TestBed.createComponent(VentanaPuntos);
    sheet.detectChanges(); window.detectChanges();
    const hoja = sheet.componentInstance, form = window.componentInstance;
    const state = TestBed.inject(GeographicPointsService);
    const originalElements = structuredClone(hoja.elements);
    form.nombre = 'Primero'; form.observaciones = 'Conservar'; form.latitud = 4; form.longitud = -73;
    form.estilo.radio = 1000; form.estilo.marcador = '#ff0000'; await form.agregar();
    sheet.detectChanges();
    expect(sheet.nativeElement.querySelectorAll('.puntos-generales-marcadores circle')).toHaveLength(0);
    state.graficar(); sheet.detectChanges(); await sheet.whenStable(); sheet.detectChanges();
    const local = hoja.puntosGeneralesLocales()[0];
    expect(local.center.x).toBeCloseTo(5000000, 5);
    expect(local.center.y).toBeCloseTo(2000000, 5);
    expect(local.ring).toHaveLength(97);
    const marker = () => sheet.nativeElement.querySelector('.puntos-generales-marcadores circle') as SVGCircleElement;
    expect(marker().getAttribute('fill')).toBe('#ff0000');
    const before = hoja.puntosGeneralesPantalla()[0].screen;
    expect(before.x).toBeGreaterThan(0); expect(before.x).toBeLessThan(hoja.viewport().width);
    expect(before.y).toBeGreaterThan(0); expect(before.y).toBeLessThan(hoja.viewport().height);
    const circle = () => hoja.puntosGeneralesPantalla()[0].points.split(' ').map(p => p.split(',').map(Number));
    const initialDistance = Math.hypot(circle()[0][0] - before.x, circle()[0][1] - before.y);
    expect(initialDistance / hoja.scale()).toBeGreaterThan(990);
    expect(initialDistance / hoja.scale()).toBeLessThan(1010);
    hoja.zoomBy(1.5); sheet.detectChanges();
    const afterZoom = hoja.puntosGeneralesPantalla()[0].screen;
    const zoomDistance = Math.hypot(circle()[0][0] - afterZoom.x, circle()[0][1] - afterZoom.y);
    expect(zoomDistance / initialDistance).toBeCloseTo(1.5, 5);
    const scale = hoja.scale(); hoja.center.update(c => ({ x: c.x + 20, y: c.y - 15 })); sheet.detectChanges();
    const afterPan = hoja.puntosGeneralesPantalla()[0].screen;
    expect(afterPan.x).toBeCloseTo(afterZoom.x - 20 * scale, 6);
    expect(afterPan.y).toBeCloseTo(afterZoom.y - 15 * scale, 6);
    form.nombre = 'Segundo'; form.longitud = -73.001; await form.agregar(); state.graficar(); sheet.detectChanges();
    expect(sheet.nativeElement.querySelectorAll('.puntos-generales-marcadores circle')).toHaveLength(2);
    expect(sheet.nativeElement.querySelectorAll('.puntos-generales-circulos polygon')).toHaveLength(2);
    const camera = { ...hoja.center() }, zoom = hoja.zoom();
    form.editar(state.registros()[0]); form.estilo.marcador = '#00ff00'; form.estilo.opacidad = .6; await form.agregar();
    sheet.detectChanges();
    expect(marker().getAttribute('fill')).toBe('#00ff00');
    expect(sheet.nativeElement.querySelector('.puntos-generales-circulos polygon').getAttribute('fill-opacity')).toBe('0.6');
    expect(hoja.center()).toEqual(camera); expect(hoja.zoom()).toBe(zoom);
    form.nuevo(); window.destroy(); sheet.detectChanges();
    const reopened = TestBed.createComponent(VentanaPuntos); reopened.detectChanges();
    state.graficar(); sheet.detectChanges(); sheet.detectChanges();
    expect(reopened.componentInstance.state.registros()).toHaveLength(2);
    expect(sheet.nativeElement.querySelectorAll('.puntos-generales-marcadores circle')).toHaveLength(2);
    expect(hoja.elements).toEqual(originalElements);
    expect(console.debug).toHaveBeenCalledWith('[PUNTOS][HOJA]', expect.objectContaining({ cantidadRecibida: 2, cantidadTransformada: 2, hojaInicializada: true, escalaDisponible: true }));
  });

  it('does not fabricate a position when the existing projection rejects the coordinate', () => {
    const sheet = TestBed.createComponent(HojaMilimetradaComponent); sheet.detectChanges();
    const state = TestBed.inject(GeographicPointsService);
    state.guardar({ nombre: 'Sin transformar', observaciones: '', latitud: 4, longitud: -73,
      radio: 500, relleno: '#2879eb', opacidad: .2, linea: '#ffffff', grosor: 2, marcador: '#2879eb', tamano: 6 });
    vi.spyOn(sheet.componentInstance as any, 'convertirWgs84AOrigenNacional').mockReturnValue(null);
    state.graficar(); sheet.detectChanges();
    expect(sheet.componentInstance.puntosGeneralesLocales()).toHaveLength(0);
    expect(sheet.nativeElement.querySelectorAll('.puntos-generales-marcadores circle')).toHaveLength(0);
  });
});
