import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';

import { Vulcano } from './vulcano';
import { DeferBlockState } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { MapaComponent } from '../../shared/components/mapa/mapa';
import { Menu } from './menu/menu';
import { VentanaLimitesSeguridad } from './ventana-limites-seguridad/ventana-limites-seguridad';
import { vi } from 'vitest';
import * as L from 'leaflet';
import * as maplibregl from 'maplibre-gl';
import { MapaTresD } from './mapa-tres-d/mapa-tres-d';
import { VentanaPuntos } from './ventana-puntos/ventana-puntos';
import { MapActionsService } from '../../shared/components/map-context-menu/map-actions.service';
import { HojaMilimetradaComponent } from './hoja-milimetrada/hoja-milimetrada.component';

describe('Vulcano', () => {
  let component: Vulcano;
  let fixture: ComponentFixture<Vulcano>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Vulcano],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Vulcano);
    component = fixture.componentInstance;
    fixture.detectChanges();
    TestBed.inject(HttpTestingController).expectNone('/api/demo-points');
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shares PUNTOS between the sheet and map menus without resetting selection or geometry', () => {
    const sheet = fixture.debugElement.query(By.directive(HojaMilimetradaComponent));
    const hoja = sheet.componentInstance as HojaMilimetradaComponent;
    const menu = fixture.debugElement.query(By.directive(Menu)).componentInstance as Menu;
    component.onCoordenadaRegistrada({ id: 'p1', nombre: 'Punto 1', tipo_graficacion: 'Pieza', latitud: 4.5, longitud: -74.25 });
    component.mostrarPoligono({ type: 'Feature', properties: { nombre: 'Conservar', descripcion: '', estilo: {
      colorRelleno: '#123456', colorLinea: '#ffffff', opacidadRelleno: .65, opacidadLinea: 1, grosorLinea: 2.5,
    } }, geometry: { type: 'Polygon', coordinates: [[[-74, 4], [-73, 4], [-73, 5], [-74, 4]]] } });
    fixture.detectChanges();
    const records = component.registrosCoordenadas, polygons = component.poligonosLimites;
    const elements = structuredClone(hoja.elements);
    const selected = hoja.selectedId();
    const openSheet = () => {
      (hoja as any).contextId.set('p1'); fixture.detectChanges();
      const buttons: HTMLButtonElement[] = Array.from(sheet.nativeElement.querySelectorAll('.element-menu button'));
      expect(buttons.map(button => button.textContent?.trim())).toEqual(['Ver información', 'Proyectar', 'Fijar', 'Límites de seguridad', 'Puntos']);
      buttons[4].click(); fixture.detectChanges();
      expect(sheet.nativeElement.querySelector('.element-menu')).toBeNull();
    };
    const actions = TestBed.inject(MapActionsService);
    const host = document.createElement('div'); document.body.appendChild(host);
    const openMap = () => {
      actions.open(host, { latitud: 4, longitud: -74 }, new MouseEvent('contextmenu', { cancelable: true }));
      host.querySelectorAll<HTMLButtonElement>('button')[3].click(); fixture.detectChanges();
    };
    try {
      openMap();
      const points = fixture.debugElement.query(By.directive(VentanaPuntos)).componentInstance as VentanaPuntos;
      const pointHost = fixture.nativeElement.querySelector('app-ventana-puntos');
      const previousZ = menu.puntosWindowZIndex;
      openSheet();
      expect(menu.puntosWindowZIndex).toBeGreaterThan(previousZ);
      expect(fixture.nativeElement.querySelector('app-ventana-puntos')).toBe(pointHost);
      points.close(); fixture.detectChanges();
      openSheet();
      const reopened = fixture.debugElement.query(By.directive(VentanaPuntos)).componentInstance as VentanaPuntos;
      expect(reopened).not.toBe(points);
      reopened.minimize(); fixture.detectChanges();
      openMap();
      expect(reopened.manager.get(reopened.id)?.minimized).toBe(false);
      expect(fixture.nativeElement.querySelectorAll('app-ventana-puntos')).toHaveLength(1);
      reopened.toggleMaximize(); reopened.toggleMaximize();
      expect(hoja.elements).toEqual(elements);
      expect(hoja.selectedId()).toBe(selected);
      expect(component.registrosCoordenadas).toBe(records);
      expect(component.poligonosLimites).toBe(polygons);
      const mapa = fixture.debugElement.query(By.directive(MapaComponent)).componentInstance as any;
      expect(mapa.map.hasLayer(mapa.capasLimitesSeguridad.get('limite-1'))).toBe(true);
      TestBed.inject(HttpTestingController).verify();
    } finally { actions.close(); host.remove(); }
  });

  it('opens PUNTOS from the shared map menu without duplicates or changes to geometry and other windows', async () => {
    const menu = fixture.debugElement.query(By.directive(Menu)).componentInstance as Menu;
    menu.openLimitesWindow(); fixture.detectChanges(); await fixture.whenStable();
    const limits = fixture.debugElement.query(By.directive(VentanaLimitesSeguridad)).componentInstance as VentanaLimitesSeguridad;
    limits.agregarPunto();
    const vertices = structuredClone(limits.vertices);
    component.mostrarPoligono({ type: 'Feature', properties: { nombre: 'Conservar', descripcion: '', estilo: { ...limits.estilo } },
      geometry: { type: 'Polygon', coordinates: [[[-74, 4], [-73, 4], [-73, 5], [-74, 4]]] } });
    fixture.detectChanges();
    const polygons = component.poligonosLimites;
    const capture = component.puntosCapturaVisual;
    const mapa = fixture.debugElement.query(By.directive(MapaComponent)).componentInstance as any;
    const layer = mapa.capasLimitesSeguridad.get('limite-1');
    const actions = TestBed.inject(MapActionsService);
    const host = document.createElement('div'); document.body.appendChild(host);
    const open = () => {
      actions.open(host, { latitud: 4, longitud: -74 }, new MouseEvent('contextmenu', { cancelable: true }));
      const buttons = host.querySelectorAll<HTMLButtonElement>('[role="menuitem"]');
      expect(buttons).toHaveLength(4);
      expect(buttons[3].textContent).toContain('PUNTOS');
      buttons[3].click(); fixture.detectChanges();
      expect(host.querySelector('[role="menu"]')).toBeNull();
    };
    try {
      open(); await fixture.whenStable();
      const points = fixture.debugElement.query(By.directive(VentanaPuntos)).componentInstance as VentanaPuntos;
      const pointHost = fixture.nativeElement.querySelector('app-ventana-puntos');
      expect(menu.puntosWindowZIndex).toBeGreaterThan(menu.limitesWindowZIndex);
      points.minimize(); fixture.detectChanges();
      open();
      expect(fixture.nativeElement.querySelector('app-ventana-puntos')).toBe(pointHost);
      expect(fixture.nativeElement.querySelectorAll('app-ventana-puntos')).toHaveLength(1);
      expect(points.manager.get(points.id)?.minimized).toBe(false);
      menu.activateLimitesWindow();
      expect(menu.limitesWindowZIndex).toBeGreaterThan(menu.puntosWindowZIndex);
      open();
      expect(menu.puntosWindowZIndex).toBeGreaterThan(menu.limitesWindowZIndex);
      points.close(); fixture.detectChanges();
      expect(fixture.debugElement.query(By.directive(VentanaPuntos))).toBeNull();
      expect(fixture.debugElement.query(By.directive(VentanaLimitesSeguridad)).componentInstance).toBe(limits);
      expect(limits.vertices).toEqual(vertices);
      expect(component.poligonosLimites).toBe(polygons);
      expect(component.puntosCapturaVisual).toBe(capture);
      expect(mapa.map.hasLayer(layer)).toBe(true);
      TestBed.inject(HttpTestingController).verify();
    } finally { actions.close(); host.remove(); }
  });

  it('retains finalized A and B when reopening, clearing or restoring draft C', async () => {
    const menu = fixture.debugElement.query(By.directive(Menu)).componentInstance as Menu;
    const mapa = fixture.debugElement.query(By.directive(MapaComponent)).componentInstance as any;
    const open = async () => {
      menu.openLimitesWindow(); fixture.changeDetectorRef.markForCheck(); fixture.detectChanges();
      await fixture.whenStable();
      const form = fixture.debugElement.query(By.directive(VentanaLimitesSeguridad)).componentInstance as VentanaLimitesSeguridad;
      vi.spyOn(form, 'probarEnvio').mockImplementation(() => {}); // Solo aisla HTTP, no la graficacion.
      return form;
    };
    const draw = (form: VentanaLimitesSeguridad, name: string, color: string, offset: number) => {
      form.nombrePoligono = name;
      form.estilo.colorRelleno = color;
      for (const [lat, lon] of [[4 + offset, 74], [5 + offset, 74], [5 + offset, 75]]) {
        form.latGrados = lat; form.lonGrados = lon; form.agregarPunto();
      }
      form.graficar(); fixture.detectChanges();
    };
    const a = await open();
    draw(a, 'A', '#123456', 0);
    const layerA = mapa.capasLimitesSeguridad.get('limite-1') as L.GeoJSON;
    expect(layerA).toBeTruthy();
    a.close(); fixture.detectChanges();
    const b = await open();
    expect(b.vertices).toEqual([]);
    expect(mapa.map.hasLayer(layerA)).toBe(true);
    draw(b, 'B', '#abcdef', 2);
    const layerB = mapa.capasLimitesSeguridad.get('limite-2') as L.GeoJSON;
    expect(component.poligonosLimites.map(p => p.properties.nombre)).toEqual(['A', 'B']);
    expect(mapa.map.hasLayer(layerA)).toBe(true);
    expect(mapa.map.hasLayer(layerB)).toBe(true);
    expect((layerA.getLayers()[0] as L.Polygon).options.fillColor).toBe('#123456');
    expect((layerB.getLayers()[0] as L.Polygon).options.fillColor).toBe('#abcdef');
    b.estilo.colorRelleno = '#ffffff';
    expect(component.poligonosLimites[1].properties.estilo.colorRelleno).toBe('#abcdef');
    b.close(); fixture.detectChanges();
    const c = await open();
    c.agregarPunto(); c.limpiarVertices();
    c.minimize(); menu.openLimitesWindow(); c.toggleMaximize(); c.toggleMaximize();
    fixture.detectChanges(); fixture.detectChanges();
    expect(c.vertices).toEqual([]);
    expect(mapa.capasLimitesSeguridad.size).toBe(2);
    expect(mapa.capasLimitesSeguridad.get('limite-1')).toBe(layerA);
    expect(mapa.map.hasLayer(layerA)).toBe(true);
    expect(mapa.map.hasLayer(layerB)).toBe(true);
    TestBed.inject(HttpTestingController).verify();
  });

  it('presents successive Leaflet clicks without registering points, moving focus or running operations', async () => {
    const menu = fixture.debugElement.query(By.directive(Menu)).componentInstance as Menu;
    menu.openLimitesWindow();
    fixture.detectChanges();
    await fixture.whenStable();
    const windowDebug = fixture.debugElement.query(By.directive(VentanaLimitesSeguridad));
    const form = windowDebug.componentInstance as VentanaLimitesSeguridad;
    const initialToggle: HTMLButtonElement = windowDebug.nativeElement.querySelector('.limits-capture-toggle');
    expect(initialToggle.getAttribute('aria-pressed')).toBe('false');
    component.onMapClick({ lat: 4, lng: -74 });
    expect(component.puntosCapturaVisual).toHaveLength(0);
    initialToggle.click();
    fixture.detectChanges();
    const addPoint = vi.spyOn(form, 'agregarPunto');
    const polygon = vi.spyOn(form.poligonoCreado, 'emit');
    const records = component.registrosCoordenadas;
    const activeElement = document.activeElement;
    const mapa = fixture.debugElement.query(By.directive(MapaComponent)).componentInstance as any;
    const click = async (lat: number, lng: number) => {
      mapa.map.fire('click', { latlng: L.latLng(lat, lng) });
      fixture.detectChanges();
      await fixture.whenStable();
    };
    await click(4.5, -74.25);
    const fields = () => Array.from(windowDebug.nativeElement.querySelectorAll('.limits-coord-grid input, .limits-coord-grid select'))
      .map((input: any) => input.value);
    expect(fields()).toEqual(['N', '4', '30', '0', '4.500000', 'W', '74', '15', '0', '-74.250000']);
    await click(-33.125, 151.75);
    expect(fields()).toEqual(['S', '33', '7', '30', '-33.125000', 'E', '151', '45', '0', '151.750000']);
    await click(0, 0);
    expect(fields()).toEqual(['N', '0', '0', '0', '0.000000', 'E', '0', '0', '0', '0.000000']);
    await click(12.5, 285.75); // Copia del mundo Leaflet: longitud normalizada.
    expect(form.longitudDecimal).toBe(-74.25);
    mapa.mapClick.emit({ lat: NaN, lng: 15 });
    expect(form.latitudDecimal).toBe(12.5);
    expect(form.vertices).toEqual([]);
    expect(form.indiceEdicion).toBeNull();
    expect(addPoint).not.toHaveBeenCalled();
    expect(polygon).not.toHaveBeenCalled();
    expect(component.registrosCoordenadas).toBe(records);
    expect(component.poligonoLimitesActual).toBeNull();
    expect(component.relacionFijada).toBeNull();
    expect(component.simulacionTrayectoria).toBeNull();
    expect(document.activeElement).toBe(activeElement);
    const toggle: HTMLButtonElement = windowDebug.nativeElement.querySelector('.limits-capture-toggle');
    const markers = mapa.marcadoresVistaPrevia as Map<number, L.CircleMarker>;
    expect(markers.size).toBe(4);
    expect(markers.get(1)!.getLatLng()).toEqual(L.latLng(4.5, -74.25));
    expect(markers.get(1)!.getTooltip()!.getContent()).toBe('P1');
    expect(markers.get(2)!.getTooltip()!.getContent()).toBe('P2');
    expect(markers.get(3)!.getTooltip()!.getContent()).toBe('P3');
    const marker = markers.get(4)!;
    expect(marker.getLatLng()).toEqual(L.latLng(12.5, -74.25));
    expect(marker.options).toMatchObject({ color: '#ffffff', fillColor: '#2879eb', interactive: false });
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.textContent).toContain('DESACTIVADA');
    expect(component.capturaCoordenadasActiva).toBe(false);
    expect(mapa.map.hasLayer(marker)).toBe(true);
    expect(markers.size).toBe(4);
    await click(45, 20);
    expect(form.latitudDecimal).toBe(12.5);
    expect(form.longitudDecimal).toBe(-74.25);
    expect(markers.size).toBe(4);
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    await click(45, 20);
    await click(46, 21);
    expect(markers.size).toBe(6);
    expect(markers.get(6)!.getLatLng()).toEqual(L.latLng(46, 21));
    expect(markers.get(6)!.getTooltip()!.getContent()).toBe('P6');
    mapa.map.setView([44, 22], 8);
    expect(markers.get(1)!.getLatLng()).toEqual(L.latLng(4.5, -74.25));
    expect(mapa.map.hasLayer(marker)).toBe(true);
    const unrelated = L.circleMarker([10, 10]).addTo(mapa.map);
    const clear: HTMLButtonElement = windowDebug.nativeElement.querySelector('.limits-clear-preview');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    clear.click();
    fixture.detectChanges();
    expect(markers.size).toBe(6);
    confirm.mockReturnValue(true);
    clear.click();
    fixture.detectChanges();
    expect(markers.size).toBe(0);
    expect(mapa.map.hasLayer(marker)).toBe(false);
    expect(mapa.map.hasLayer(unrelated)).toBe(true);
    expect(clear.disabled).toBe(true);
    expect(form.latitudDecimal).toBe(46);
    await click(46, 21);
    expect(markers.get(1)!.getTooltip()!.getContent()).toBe('P1');
    confirm.mockRestore();
    expect(form.latitudDecimal).toBe(46);
    expect(form.longitudDecimal).toBe(21);
    expect(form.vertices).toEqual([]);
    expect(addPoint).not.toHaveBeenCalled();
    expect(polygon).not.toHaveBeenCalled();
    TestBed.inject(HttpTestingController).verify();
  });

  it('resets capture on close and reopen but preserves it when minimizing and restoring', async () => {
    const menu = fixture.debugElement.query(By.directive(Menu)).componentInstance as Menu;
    menu.openLimitesWindow();
    fixture.detectChanges();
    await fixture.whenStable();
    const form = fixture.debugElement.query(By.directive(VentanaLimitesSeguridad)).componentInstance as VentanaLimitesSeguridad;
    form.capturaCoordenadasActivaChange.emit(true);
    fixture.detectChanges();
    component.onMapClick({ lat: 4, lng: -74 });
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    const points = component.puntosCapturaVisual;
    form.minimize();
    fixture.detectChanges();
    menu.openLimitesWindow();
    fixture.detectChanges();
    expect(component.capturaCoordenadasActiva).toBe(true);
    expect(form.capturaCoordenadasActiva).toBe(true);
    form.close();
    fixture.detectChanges();
    expect(component.capturaCoordenadasActiva).toBe(false);
    component.onMapClick({ lat: 5, lng: -75 });
    expect(component.puntosCapturaVisual).toBe(points);
    menu.openLimitesWindow();
    fixture.detectChanges();
    await fixture.whenStable();
    const reopened = fixture.debugElement.query(By.directive(VentanaLimitesSeguridad));
    expect(reopened.componentInstance).not.toBe(form);
    expect(reopened.componentInstance.capturaCoordenadasActiva).toBe(false);
    expect(reopened.nativeElement.querySelector('.limits-capture-toggle').getAttribute('aria-pressed')).toBe('false');
    expect(component.puntosCapturaVisual).toBe(points);
  });

  it('defers the hidden 3D map and retains its instance after first use', async () => {
    expect(fixture.nativeElement.querySelector('app-mapa-tres-d')).toBeNull();
    const [block] = await fixture.getDeferBlocks();
    await block.render(DeferBlockState.Complete);
    const mapHost = fixture.nativeElement.querySelector('app-mapa-tres-d');
    expect(mapHost).toBeTruthy();
    component.vistaActiva = '3d';
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    component.vistaActiva = '2d';
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-mapa-tres-d')).toBe(mapHost);
  });

  it('shares preview history between Leaflet and MapLibre without duplicates after style reload', async () => {
    const [block] = await fixture.getDeferBlocks();
    await block.render(DeferBlockState.Complete);
    const three = fixture.debugElement.query(By.directive(MapaTresD)).componentInstance as any;
    const two = fixture.debugElement.query(By.directive(MapaComponent)).componentInstance as any;
    // Simula solo el contenedor de MapLibre: el entorno DOM no dispone de WebGL.
    const canvas = document.createElement('div');
    const surface = vi.fn(() => true);
    const unproject = vi.fn(() => new maplibregl.LngLat(151.75, -33.125));
    const handlers = new Map<string, Function>();
    const pointSources = new Map<string, any>(), pointLayers = new Map<string, any>();
    const map = {
      getCanvasContainer: () => canvas, transform: { isPointOnMapSurface: surface },
      isStyleLoaded: () => true, getStyle: () => ({ sources: {}, layers: [] }),
      getSource: (id: string) => pointSources.get(id),
      addSource: (id: string, data: any) => pointSources.set(id, { ...data, setData(value: unknown) { this.data = value; } }),
      getLayer: (id: string) => pointLayers.get(id), addLayer: (layer: any) => pointLayers.set(layer.id, layer),
      unproject, on: vi.fn((event: string, handler: Function) => handlers.set(event, handler)),
    };
    const addTo = vi.spyOn(maplibregl.Marker.prototype, 'addTo').mockImplementation(function (this: maplibregl.Marker) {
      canvas.appendChild(this.getElement());
      return this;
    });
    three.map = map;
    three.terrainDiagnosticMode = true;
    vi.spyOn(three, 'logMapPerformance').mockImplementation(() => {});
    vi.spyOn(three, 'logStyleState').mockImplementation(() => {});
    vi.spyOn(three, 'logPitch').mockImplementation(() => {});
    three.bindMapEvents();
    try {
      const click3d = () => handlers.get('click')!({
        point: { x: 100, y: 100 }, originalEvent: { target: canvas }, defaultPrevented: false,
      });
      component.capturaCoordenadasActiva = true;
      two.map.fire('click', { latlng: L.latLng(4.5, -74.25) });
      fixture.detectChanges();
      expect(three.puntosCapturaVisual).toBe(component.puntosCapturaVisual);
      expect(three.marcadoresVistaPrevia.get(1).getLngLat()).toEqual(new maplibregl.LngLat(-74.25, 4.5));
      click3d();
      fixture.detectChanges();
      expect(component.puntosCapturaVisual).toHaveLength(2);
      expect(two.marcadoresVistaPrevia.get(2).getLatLng()).toEqual(L.latLng(-33.125, 151.75));
      expect(three.marcadoresVistaPrevia.get(2).getElement().textContent).toBe('P2');
      const first = three.marcadoresVistaPrevia.get(1);
      handlers.get('style.load')!();
      handlers.get('style.load')!();
      expect(three.marcadoresVistaPrevia.size).toBe(2);
      expect(three.marcadoresVistaPrevia.get(1)).toBe(first);
      expect(addTo).toHaveBeenCalledTimes(2);
      for (const vista of ['3d', '2d', '3d', '2d'] as const) {
        component.vistaActiva = vista;
        fixture.changeDetectorRef.markForCheck();
        fixture.detectChanges();
      }
      expect(three.marcadoresVistaPrevia.size).toBe(2);
      expect(two.marcadoresVistaPrevia.size).toBe(2);
      first.getElement().remove();
      handlers.get('style.load')!();
      expect(first.getElement().parentElement).toBe(canvas);
      component.capturaCoordenadasActiva = false;
      click3d();
      expect(component.puntosCapturaVisual).toHaveLength(2);
      expect(three.marcadoresVistaPrevia.size).toBe(2);
      surface.mockReturnValue(false); // Cielo: no selecciona ubicaciones sin superficie.
      component.capturaCoordenadasActiva = true;
      click3d();
      expect(component.puntosCapturaVisual).toHaveLength(2);
      component.puntosCapturaVisual = [];
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();
      expect(three.marcadoresVistaPrevia.size).toBe(0);
      expect(two.marcadoresVistaPrevia.size).toBe(0);
      expect(canvas.children).toHaveLength(0);
      // PUNTOS consume un solo clic de ambos motores sin registrar ni tocar el historial anterior.
      surface.mockReturnValue(true);
      component.puntosState.captura.set(true);
      click3d(); fixture.detectChanges();
      expect(component.puntosState.temporal()).toMatchObject({ latitud: -33.125, longitud: 151.75 });
      expect(component.puntosState.captura()).toBe(false);
      expect(component.puntosState.registros()).toHaveLength(0);
      expect(component.puntosCapturaVisual).toHaveLength(0);
      component.puntosState.captura.set(true);
      two.map.fire('click', { latlng: L.latLng(4.5, -74.25) }); fixture.detectChanges();
      expect(component.puntosState.temporal()).toMatchObject({ latitud: 4.5, longitud: -74.25 });
      expect(three.puntosGeograficos.features).toHaveLength(1);
      expect(component.puntosState.registros()).toHaveLength(0);
      TestBed.inject(HttpTestingController).verify();
    } finally {
      three.map = null;
      addTo.mockRestore();
    }
  });
});
