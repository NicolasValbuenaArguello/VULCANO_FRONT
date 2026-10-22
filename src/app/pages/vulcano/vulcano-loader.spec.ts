import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { LOADER_OPERATION, loaderInterceptor } from '../../core/interceptors/loader.interceptor';
import { LoaderService } from '../../core/services/loader.service';
import { SimulacionTrayectoriaResponse } from '../../core/services/vulcano-api.service';
import { Vulcano } from './vulcano';
import { HojaMilimetradaComponent } from './hoja-milimetrada/hoja-milimetrada.component';
import { IconosService } from '../../shared/services/iconos.service';

describe('Vulcano loader operations', () => {
  const p1 = { id: 'p1', tipo_graficacion: 'Pieza', nombre: 'P1', latitud: 3.425, longitud: -75.425 };
  const p2 = { ...p1, id: 'p2', nombre: 'P2', latitud: 3.426 };
  const relation = {
    origenId: 'p1', destinoId: 'p2', origen: { ...p1, x: 1, y: 1 }, destino: { ...p2, x: 2, y: 2 },
    distanciaMetros: 100, azimutGrados: 0,
  };
  const response: SimulacionTrayectoriaResponse = {
    simulacion: true, p1: { ...p1, elevacion_msnm: 100 }, p2: { ...p2, elevacion_msnm: 100 }, distancia_m: 100,
    datos_simulados: { angulo_visual_grados: 45, carga_simulada: 1, apogeo_visual_m: 50 },
    apogeo: { latitud: 3.4255, longitud: -75.425, terreno_msnm: 100, altura_visual_m: 50, altitud_visual_msnm: 150 },
    resumen_perfil: { elevacion_minima_msnm: 100, elevacion_maxima_msnm: 100, elevacion_media_msnm: 100, desnivel_p1_p2_m: 0, muestras: 0 },
    perfil_elevacion: [],
  };
  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [Vulcano], providers: [
      provideHttpClient(withInterceptors([loaderInterceptor])), provideHttpClientTesting(),
    ] });
    // Exercise the real parent template without initializing maps or WebGL.
    TestBed.overrideComponent(Vulcano, { set: { imports: [], schemas: [NO_ERRORS_SCHEMA] } });
    vi.spyOn(window, 'alert').mockImplementation(() => {});
  });
  afterEach(() => {
    TestBed.inject(HttpTestingController).verify();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });
  function setup() {
    const fixture = TestBed.createComponent(Vulcano);
    fixture.componentInstance.registrosCoordenadas = [p1, p2];
    fixture.detectChanges();
    return { fixture, component: fixture.componentInstance, http: TestBed.inject(HttpTestingController), loader: TestBed.inject(LoaderService) };
  }
  function prepareReport(component: Vulcano) {
    component.relacionFijada = relation;
    component.simulacionTrayectoria = response;
    const capture = () => Promise.resolve('data:image/png;base64,dGVzdA==');
    Object.assign(component, {
      hojaMilimetradaRef: { capturarHojaParaInforme: capture, capturarPerfilParaInforme: capture },
      mapa2dRef: { capturarParaInforme: capture }, mapa3dRef: { capturarParaInforme: capture },
    });
  }

  it('removes the actual overlay after simulation success without manual change detection', async () => {
    const { fixture, component, http, loader } = setup();
    component.onRelacionFijada(relation);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.simulacion-loader-overlay')).not.toBeNull();
    expect(loader.pendingRequests()).toBe(1);
    http.expectOne('/api/coordenadas/simular-trayectoria').flush(response);
    await fixture.whenStable();
    expect(component.simulacionTrayectoria).toEqual(response);
    expect(loader.pendingRequests()).toBe(0);
    expect(fixture.nativeElement.querySelector('.simulacion-loader-overlay')).toBeNull();
  });

  it('releases HTTP errors, missing-point validation, replacement and view cancellation', async () => {
    const { fixture, component, http, loader } = setup();
    component.onRelacionFijada({ ...relation, origenId: 'missing' });
    expect(loader.pendingRequests()).toBe(0);
    component.onRelacionFijada(relation);
    http.expectOne('/api/coordenadas/simular-trayectoria').flush({}, { status: 500, statusText: 'Error' });
    await fixture.whenStable();
    expect(component.errorSimulacion).not.toBeNull();
    expect(loader.pendingRequests()).toBe(0);
    component.onRelacionFijada(relation);
    const old = http.expectOne('/api/coordenadas/simular-trayectoria');
    component.onRelacionFijada({ ...relation, origenId: 'p2', destinoId: 'p1' });
    expect(old.cancelled).toBe(true);
    expect(loader.pendingRequests()).toBe(1);
    const replacement = http.expectOne('/api/coordenadas/simular-trayectoria');
    component.onVistaChange('hoja-milimetrada');
    expect(replacement.cancelled).toBe(true);
    expect(loader.pendingRequests()).toBe(0);
  });

  it('releases simulation on component destruction and timeout', () => {
    vi.useFakeTimers();
    const { fixture, component, http, loader } = setup();
    component.onRelacionFijada(relation);
    const pending = http.expectOne('/api/coordenadas/simular-trayectoria');
    vi.advanceTimersByTime(30_001);
    expect(pending.cancelled).toBe(true);
    expect(component.errorSimulacion).toContain('Timeout');
    expect(loader.pendingRequests()).toBe(0);
    component.onRelacionFijada(relation);
    const second = http.expectOne('/api/coordenadas/simular-trayectoria');
    fixture.destroy();
    expect(second.cancelled).toBe(true);
    expect(loader.pendingRequests()).toBe(0);
  });

  it('keeps one overlay during concurrent coordinate registration and simulation', async () => {
    const { fixture, component, http, loader } = setup();
    TestBed.inject(HttpClient).post('/register', {}, {
      context: new HttpContext().set(LOADER_OPERATION, 'REGISTRAR COORDENADAS'),
    }).subscribe();
    component.onRelacionFijada(relation);
    expect(loader.pendingRequests()).toBe(2);
    http.expectOne('/api/coordenadas/simular-trayectoria').flush(response);
    fixture.detectChanges();
    expect(loader.pendingRequests()).toBe(1);
    expect(fixture.nativeElement.querySelectorAll('.simulacion-loader-overlay')).toHaveLength(1);
    http.expectOne('/register').flush({});
    await fixture.whenStable();
    expect(loader.pendingRequests()).toBe(0);
    expect(fixture.nativeElement.querySelector('.simulacion-loader-overlay')).toBeNull();
  });

  it('releases PDF after capture failure', async () => {
    const { component, loader } = setup();
    prepareReport(component);
    vi.spyOn(component as any, 'capturarEtapa').mockRejectedValueOnce(new Error('capture failed'));
    await component.generarInformePdf();
    expect(loader.pendingRequests()).toBe(0);
    expect(component.generandoInforme).toBe(false);
  });

  it('projects the report indicator inside the fullscreen panel without leaving fullscreen', async () => {
    TestBed.overrideComponent(Vulcano, { set: { imports: [HojaMilimetradaComponent], schemas: [NO_ERRORS_SCHEMA] } });
    const { fixture, component } = setup();
    component.vistaActiva = 'hoja-milimetrada';
    prepareReport(component);
    Object.assign(component, { hojaMilimetradaRef: { capturarHojaParaInforme: () => new Promise(() => {}) } });
    const report = component.generarInformePdf();
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    const panel = fixture.nativeElement.querySelector('.plotting-panel');
    expect(panel.querySelector('.simulacion-loader-overlay')).not.toBeNull();
    expect(panel.querySelector('.simulacion-loader-title').textContent).toBe('GENERANDO INFORME');
    fixture.destroy();
    await report;
  });

  it('requests a report only on click, after GRAFICAR, and blocks clicks while busy', () => {
    const fixture = TestBed.createComponent(HojaMilimetradaComponent);
    fixture.detectChanges();
    const requested = vi.fn();
    fixture.componentInstance.informeSolicitado.subscribe(requested);
    const buttons = Array.from(fixture.nativeElement.querySelectorAll('.plane-controls button')) as HTMLButtonElement[];
    const report = buttons.find(button => button.textContent?.trim() === 'INFORME')!;
    expect(report.previousElementSibling?.textContent?.trim()).toBe('GRAFICAR');
    expect(requested).not.toHaveBeenCalled();
    report.click();
    expect(requested).toHaveBeenCalledOnce();
    fixture.componentRef.setInput('generandoInforme', true);
    fixture.detectChanges();
    expect(report.disabled).toBe(true);
    report.click();
    expect(requested).toHaveBeenCalledOnce();
    fixture.destroy();
  });

  it('tracks the real Proyectar flow on success and HTTP failure', async () => {
    const fixture = TestBed.createComponent(HojaMilimetradaComponent);
    const component = fixture.componentInstance;
    const loader = TestBed.inject(LoaderService);
    const http = TestBed.inject(HttpTestingController);
    fixture.componentRef.setInput('registrosCoordenadas', [p1]);
    fixture.detectChanges();
    const icons = TestBed.inject(IconosService);
    icons.seleccionarIcono(icons.catalogoIconos[0]);
    for (const fail of [false, true]) {
      component.openElement(new Event('click'), component.elements[0]);
      component.abrirVentanaProyectar(new Event('click'));
      component.distanciaProyeccion = '100';
      component.azimutProyeccion = 0;
      component.tipoGraficacionProyeccion = 'Pieza';
      component.nombreProyeccion = 'PR1';
      const operation = component.proyectarElemento();
      expect(loader.pendingRequests()).toBe(1);
      const pending = http.expectOne('/api/coordenadas/registrar');
      if (fail) pending.flush({}, { status: 500, statusText: 'Error' });
      else pending.flush({ ok: true, mensaje: 'OK', registro: { ...p2, id: 'pr1' } });
      await operation;
      expect(loader.pendingRequests()).toBe(0);
      expect(component.proyectando).toBe(false);
    }
    fixture.destroy();
  });

  it('tracks PDF through captures, HTTP, validation and download', async () => {
    const { fixture, component, http, loader } = setup();
    prepareReport(component);
    const create = vi.fn(() => 'blob:test');
    const revoke = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: create });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const report = component.generarInformePdf();
    await component.generarInformePdf(); // El bloqueo existente evita una segunda solicitud.
    for (let i = 0; i < 30; i++) await Promise.resolve();
    expect(loader.pendingRequests()).toBe(1);
    const blob = new Blob(['%PDF-test'], { type: 'application/pdf' });
    // jsdom Blob does not implement arrayBuffer in every supported version.
    vi.spyOn(blob, 'slice').mockReturnValue({ arrayBuffer: async () => new Uint8Array([37, 80, 68, 70]).buffer } as Blob);
    http.expectOne('/api/coordenadas/generar-informe-pdf').flush(blob);
    await report;
    await fixture.whenStable();
    expect(click).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith('blob:test');
    expect(loader.pendingRequests()).toBe(0);
    expect(fixture.nativeElement.querySelector('.simulacion-loader-overlay')).toBeNull();
    click.mockImplementation(() => { throw new Error('download failed'); });
    const failed = component.generarInformePdf();
    for (let i = 0; i < 30; i++) await Promise.resolve();
    http.expectOne('/api/coordenadas/generar-informe-pdf').flush(blob);
    await failed;
    expect(loader.pendingRequests()).toBe(0);
    expect(revoke).toHaveBeenCalledTimes(2);
  });

  it('releases a PDF waiting for a capture when the page is destroyed', async () => {
    const { fixture, component, loader } = setup();
    prepareReport(component);
    Object.assign(component, { hojaMilimetradaRef: { capturarHojaParaInforme: () => new Promise(() => {}) } });
    const report = component.generarInformePdf();
    expect(loader.pendingRequests()).toBe(1);
    fixture.destroy();
    await report;
    expect(loader.pendingRequests()).toBe(0);
  });

  it.each(['http', 'empty', 'invalid'])('releases PDF after %s response failure', async failure => {
    const { component, http, loader } = setup();
    prepareReport(component);
    const report = component.generarInformePdf();
    for (let i = 0; i < 30; i++) await Promise.resolve();
    const pending = http.expectOne('/api/coordenadas/generar-informe-pdf');
    if (failure === 'http') pending.flush(null, { status: 500, statusText: 'Error' });
    else {
      const blob = new Blob([failure === 'empty' ? '' : 'bad'], { type: 'application/pdf' });
      vi.spyOn(blob, 'slice').mockReturnValue({ arrayBuffer: async () => new Uint8Array([98, 97, 100]).buffer } as Blob);
      pending.flush(blob);
    }
    await report;
    expect(loader.pendingRequests()).toBe(0);
    expect(loader.loading()).toBe(false);
  });
});
