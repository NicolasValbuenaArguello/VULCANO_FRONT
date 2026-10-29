import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { VentanaLimitesSeguridad } from './ventana-limites-seguridad';
import { Menu } from '../menu/menu';
import { Vulcano } from '../vulcano';
import { HojaMilimetradaComponent } from '../hoja-milimetrada/hoja-milimetrada.component';
import { MapActionsService } from '../../../shared/components/map-context-menu/map-actions.service';

describe('Limites de seguridad', () => {
  beforeEach(() =>
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }),
  );

  it('selects coordinates on entry while preserving subsequent clicks and numeric bindings', async () => {
    const fixture = TestBed.createComponent(VentanaLimitesSeguridad);
    fixture.detectChanges();
    await fixture.whenStable();
    const root: HTMLElement = fixture.nativeElement;
    const inputs = Array.from(root.querySelectorAll<HTMLInputElement>('.limits-coord-grid input'));
    expect(inputs).toHaveLength(8);
    expect(root.querySelectorAll('select[appCoordinateSelect]')).toHaveLength(0);
    expect(root.querySelector('#limite-nombre')?.hasAttribute('appCoordinateSelect')).toBe(false);

    for (const input of inputs) {
      const select = vi.spyOn(input, 'select');
      input.dispatchEvent(new MouseEvent('pointerdown', { button: 0 }));
      input.dispatchEvent(new FocusEvent('focus'));
      expect(select).toHaveBeenCalledOnce();
      const firstRelease = new MouseEvent('mouseup', { cancelable: true });
      input.dispatchEvent(firstRelease);
      expect(firstRelease.defaultPrevented).toBe(true);
      select.mockClear();
      const laterRelease = new MouseEvent('mouseup', { cancelable: true });
      input.dispatchEvent(laterRelease);
      expect(laterRelease.defaultPrevented).toBe(false);
      expect(select).not.toHaveBeenCalled();
      input.dispatchEvent(new FocusEvent('blur'));
      input.dispatchEvent(new FocusEvent('focus')); // Entrada por teclado, sin pointerdown.
      expect(select).toHaveBeenCalledOnce();
      input.dispatchEvent(new Event('input', { bubbles: true }));
      expect(select).toHaveBeenCalledOnce();
      input.dispatchEvent(new FocusEvent('blur'));
    }

    const degrees = inputs[0];
    expect(degrees.type).toBe('number');
    expect(degrees.value).toBe('0');
    degrees.value = '3';
    degrees.dispatchEvent(new Event('input', { bubbles: true }));
    expect(fixture.componentInstance.latGrados).toBe(3);
    expect(inputs[3].readOnly).toBe(true);
    fixture.destroy();
  });

  it('preserves geometry and registers only presentation while minimizing, maximizing and closing', () => {
    const fixture = TestBed.createComponent(VentanaLimitesSeguridad);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const original = { ...component.rect };
    expect(component.manager.get(component.id)?.title).toBe('L\u00cdMITES DE SEGURIDAD');
    expect(fixture.nativeElement.querySelectorAll('.systems-resize')).toHaveLength(8);
    component.minimize();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.floating-window__content').hidden).toBe(true);
    component.restore();
    component.toggleMaximize();
    expect(component.rect.width).toBe(window.innerWidth);
    component.toggleMaximize();
    expect(component.rect).toEqual(original);
    const closed = vi.fn();
    component.closed.subscribe(closed);
    component.close();
    expect(closed).toHaveBeenCalledOnce();
    fixture.destroy();
    expect(component.manager.get(component.id)).toBeUndefined();
  });

  it('moves within bounds and supports every edge and corner', () => {
    const fixture = TestBed.createComponent(VentanaLimitesSeguridad);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const target = document.createElement('header');
    const pointer = (x: number, y: number) =>
      ({
        button: 0,
        pointerId: 1,
        clientX: x,
        clientY: y,
        target,
        currentTarget: target,
        preventDefault() {},
        stopPropagation() {},
      }) as unknown as PointerEvent;
    component.startPointer(pointer(0, 0));
    component.endPointer(pointer(-10000, -10000));
    expect(component.rect.x).toBe(0);
    expect(component.rect.y).toBe(0);
    for (const edge of component.edges) {
      component.manager.setRect(component.id, { x: 100, y: 100, width: 500, height: 350 });
      const before = { ...component.rect };
      component.startPointer(pointer(0, 0), edge);
      component.endPointer(pointer(15, 15));
      expect(component.rect).not.toEqual(before);
      expect(component.rect.width).toBeGreaterThanOrEqual(420);
      expect(component.rect.height).toBeGreaterThanOrEqual(300);
    }
  });

  it('opens the same instance from map and piece, restores it, and permits reopening after close', async () => {
    const menuFixture = TestBed.createComponent(Menu);
    menuFixture.detectChanges();
    const menu = menuFixture.componentInstance;
    const parent = TestBed.createComponent(Vulcano);
    (parent.componentInstance as any).menuRef = menu;
    const hoja = TestBed.createComponent(HojaMilimetradaComponent);
    hoja.componentInstance.abrirLimitesSeguridad.subscribe(() => menu.openLimitesWindow());
    const service = TestBed.inject(MapActionsService);
    const host = document.createElement('div');
    document.body.append(host);
    service.open(
      host,
      { latitud: 4, longitud: -74 },
      new MouseEvent('contextmenu', { cancelable: true }),
    );
    expect(host.querySelectorAll('button')).toHaveLength(4);
    const projection = vi.spyOn(hoja.componentInstance, 'abrirProyeccionDesdeMapa');
    (parent.componentInstance as any).hojaMilimetradaRef = hoja.componentInstance;
    host.querySelectorAll('button')[2].click();
    menuFixture.detectChanges();
    await menuFixture.whenStable();
    const first = menuFixture.nativeElement.querySelector('app-ventana-limites-seguridad');
    expect(first).toBeTruthy();
    expect(projection).not.toHaveBeenCalled();
    first.querySelector('[title="Minimizar"]').click();
    menuFixture.detectChanges();
    hoja.componentInstance.solicitarLimitesSeguridad();
    menuFixture.detectChanges();
    expect(menuFixture.nativeElement.querySelector('app-ventana-limites-seguridad')).toBe(first);
    expect(first.querySelector('.floating-window__content').hidden).toBe(false);
    const z = menu.limitesWindowZIndex;
    menu.activateExistingWindow('graficar');
    expect(menu.graficarWindowZIndex).toBeGreaterThan(z);
    menu.openLimitesWindow();
    expect(menu.limitesWindowZIndex).toBeGreaterThan(menu.graficarWindowZIndex);
    first.querySelector('[title="Cerrar"]').click();
    menuFixture.detectChanges();
    expect(menuFixture.nativeElement.querySelector('app-ventana-limites-seguridad')).toBeNull();
    menu.openLimitesWindow();
    menuFixture.detectChanges();
    expect(
      menuFixture.nativeElement.querySelectorAll('app-ventana-limites-seguridad'),
    ).toHaveLength(1);
    host.remove();
    service.close();
  });
  describe('Editor GIS exclusivamente local', () => {
    let fixture: ReturnType<typeof TestBed.createComponent<VentanaLimitesSeguridad>>;
    let editor: VentanaLimitesSeguridad;
    beforeEach(() => {
      fixture = TestBed.createComponent(VentanaLimitesSeguridad);
      fixture.detectChanges();
      editor = fixture.componentInstance;
    });
    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
      vi.useRealTimers();
    });
    /** Registra coordenadas enteras sinteticas a traves del formulario del editor. */
    function agregar(latitud: number, longitud: number): void {
      editor.latGrados = Math.abs(latitud);
      editor.latMinutos = 0;
      editor.latSegundos = 0;
      editor.lonGrados = Math.abs(longitud);
      editor.lonMinutos = 0;
      editor.lonSegundos = 0;
      editor.latHemisferio = latitud < 0 ? 'S' : 'N';
      editor.lonHemisferio = longitud < 0 ? 'W' : 'E';
      editor.agregarPunto();
    }
    function triangulo(): void {
      agregar(0, 0);
      agregar(0, 1);
      agregar(1, 0);
      editor.nombrePoligono = 'Prueba local';
    }

    it('converts hemispheres and edits without changing the vertex ID or duplicating a row', () => {
      editor.latHemisferio = 'S';
      editor.latGrados = 12;
      editor.latMinutos = 30;
      editor.latSegundos = 15;
      editor.lonHemisferio = 'W';
      editor.lonGrados = 70;
      editor.lonMinutos = 20;
      editor.lonSegundos = 30;
      expect(editor.latitudDecimal).toBeCloseTo(-12.50416667, 8);
      expect(editor.longitudDecimal).toBeCloseTo(-70.34166667, 8);
      editor.agregarPunto();
      const anterior = { ...editor.vertices[0] };
      editor.editarVertice(0);
      expect(editor.latitudDecimal).toBeCloseTo(anterior.latitud, 7);
      expect(editor.longitudDecimal).toBeCloseTo(anterior.longitud, 7);
      expect(editor.latHemisferio).toBe('S');
      expect(editor.lonHemisferio).toBe('W');
      editor.latSegundos = 30;
      editor.agregarPunto();
      expect(editor.vertices).toHaveLength(1);
      expect(editor.vertices[0].id).toBe(anterior.id);
      expect(editor.vertices[0].latitud).toBeCloseTo(-12.50833333, 8);
      expect(editor.indiceEdicion).toBeNull();
    });

    it('validates DMS boundaries, empty fields and minutes before rounding', () => {
      agregar(90, 180);
      expect(editor.vertices).toHaveLength(1);
      editor.latSegundos = 0.000001;
      editor.agregarPunto();
      expect(editor.vertices).toHaveLength(1);
      editor.latSegundos = 0;
      editor.lonSegundos = 0.000001;
      editor.agregarPunto();
      expect(editor.vertices).toHaveLength(1);
      editor.lonSegundos = 0;
      editor.latGrados = null as unknown as number;
      editor.agregarPunto();
      expect(editor.vertices).toHaveLength(1);
      editor.latGrados = 45;
      editor.latMinutos = 60;
      editor.agregarPunto();
      expect(editor.vertices).toHaveLength(1);
      editor.latMinutos = 0;
      editor.lonGrados = 60;
      editor.lonSegundos = 60;
      editor.agregarPunto();
      expect(editor.vertices).toHaveLength(1);
    });

    it('rejects consecutive duplicates including ring closure and edit neighbours', () => {
      agregar(0, 0);
      agregar(0, 0);
      expect(editor.vertices).toHaveLength(1);
      agregar(0, 1);
      agregar(0, 0);
      expect(editor.vertices).toHaveLength(2);
      agregar(1, 0);
      editor.editarVertice(1);
      agregar(0, 0);
      expect(editor.vertices[1].longitud).toBe(1);
      expect(editor.indiceEdicion).toBe(1);
    });

    it('deletes safely, cancels stale editing and clears only local vertices', () => {
      triangulo();
      editor.editarVertice(1);
      editor.eliminarVertice(0);
      expect(editor.vertices.map((v) => v.id)).toEqual([2, 3]);
      expect(editor.indiceEdicion).toBeNull();
      editor.eliminarVertice(-1);
      editor.eliminarVertice(1.5);
      expect(editor.vertices).toHaveLength(2);
      editor.limpiarVertices();
      expect(editor.vertices).toEqual([]);
      expect(editor.nombrePoligono).toBe('Prueba local');
      agregar(0, 0);
      expect(editor.vertices[0].id).toBe(1);
    });

    it('binds the actual inputs, rows, styles and status without sample vertices', async () => {
      const host: HTMLElement = fixture.nativeElement;
      expect(host.querySelectorAll('circle')).toHaveLength(0);
      const nombre = host.querySelector<HTMLInputElement>('#limite-nombre')!;
      nombre.value = 'Editor local';
      nombre.dispatchEvent(new Event('input'));
      const lat = host.querySelector<HTMLInputElement>('[aria-label="Grados latitud"]')!;
      lat.value = '4';
      lat.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      const boton = host.querySelector<HTMLButtonElement>('.limits-panel-heading .limits-btn-blue')!;
      boton.click();
      fixture.detectChanges();
      expect(editor.nombrePoligono).toBe('Editor local');
      expect(editor.vertices[0].latitud).toBe(4);
      expect(host.querySelector('tbody')!.textContent).toContain('4.000000');
      host.querySelector<HTMLButtonElement>('[aria-label="Editar punto 1"]')!.click();
      fixture.detectChanges();
      expect(boton.textContent).toContain('ACTUALIZAR PUNTO');
      const color = host.querySelector<HTMLInputElement>('#color-relleno')!;
      color.value = '#ff0000';
      color.dispatchEvent(new Event('input'));
      const rango = host.querySelector<HTMLInputElement>('#opacidad')!;
      rango.value = '0.25';
      rango.dispatchEvent(new Event('input'));
      const grosor = host.querySelector<HTMLSelectElement>('#grosor')!;
      grosor.value = grosor.options[2].value;
      grosor.dispatchEvent(new Event('change'));
      await fixture.whenStable();
      fixture.detectChanges();
      expect(editor.estilo.colorRelleno).toBe('#ff0000');
      expect(editor.estilo.opacidadRelleno).toBe(0.25);
      expect(editor.estilo.grosorLinea).toBe(4);
      expect(host.querySelector('.limits-status')!.textContent).toContain(editor.mensajeEstado);
      host.querySelector<HTMLButtonElement>('[aria-label="Eliminar punto 1"]')!.click();
      fixture.detectChanges();
      expect(editor.vertices).toHaveLength(0);
      expect(host.querySelectorAll('circle')).toHaveLength(0);
    });

    it('uses identical projection for contour, vertex markers and labels, updating immediately', async () => {
      triangulo();
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();
      await fixture.whenStable();
      const host: HTMLElement = fixture.nativeElement;
      const posiciones = [...host.querySelectorAll('circle')].map(
        (c) => `${c.getAttribute('cx')},${c.getAttribute('cy')}`,
      );
      expect(host.querySelector('polygon')!.getAttribute('points')).toBe(posiciones.join(' '));
      expect([...host.querySelectorAll('svg text')].map((t) => t.textContent)).toEqual([
        'P1',
        'P2',
        'P3',
      ]);
      editor.estilo.colorRelleno = '#00ff00';
      editor.estilo.opacidadLinea = 0.4;
      editor.estilo.grosorLinea = 4;
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();
      expect(host.querySelector('polygon')!.getAttribute('fill')).toBe('#00ff00');
      expect(host.querySelector('polygon')!.getAttribute('stroke-opacity')).toBe('0.4');
      editor.editarVertice(2);
      agregar(2, 0);
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();
      expect(host.querySelectorAll('circle')).toHaveLength(3);
      editor.limpiarVertices();
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();
      expect(host.querySelector('polygon')).toBeNull();
    });

    it('does not confirm SVG before rendering and cancels stale success after a vertex is removed', async () => {
      triangulo();
      editor.graficar();
      expect(editor.estadoGeometria).toBe('validada');
      expect(editor.estadoGeoJSON).toBe('generado');
      expect(editor.estadoVistaPrevia).toBe('pendiente');
      expect(editor.mensajeEstado).toContain('SVG PENDIENTE');
      editor.eliminarVertice(0);
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(editor.estadoGeometria).toBe('pendiente');
      expect(editor.estadoGeoJSON).toBe('pendiente');
      expect(editor.geoJSONGenerado).toBeNull();
      expect(editor.estadoVistaPrevia).toBe('pendiente');
      expect(editor.mensajeEstado).not.toContain('GEOJSON GENERADO');
    });

    it('invalidates generated metadata when name or style is edited from the form', async () => {
      triangulo();
      editor.generarGeoJSON();
      const host: HTMLElement = fixture.nativeElement;
      const nombre = host.querySelector<HTMLInputElement>('#limite-nombre')!;
      nombre.value = 'Nombre nuevo';
      nombre.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      expect(editor.geoJSONGenerado).toBeNull();
      expect(editor.estadoGeoJSON).toBe('pendiente');
      editor.generarGeoJSON();
      const color = host.querySelector<HTMLInputElement>('#color-relleno')!;
      color.value = '#ff0000';
      color.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      expect(editor.geoJSONGenerado).toBeNull();
      expect(editor.estadoGeometria).toBe('pendiente');
    });

    it('does not report GeoJSON success when only geometry validates but style is invalid', () => {
      triangulo();
      editor.estilo.opacidadRelleno = 2;
      expect(editor.generarGeoJSON()).toBeNull();
      expect(editor.estadoGeometria).toBe('validada');
      expect(editor.estadoGeoJSON).toBe('pendiente');
      expect(editor.geoJSONGenerado).toBeNull();
      expect(editor.mensajeEstado).toContain('ESTILO INVALIDO');
      expect(editor.mensajeEstado).not.toContain('SVG ACTUALIZADA');
    });

    it('exports typed GeoJSON with lon/lat, closed ring and style without mutating editable vertices', () => {
      triangulo();
      const feature = editor.generarGeoJSON()!;
      expect(feature.geometry.coordinates).toEqual([
        [
          [0, 0],
          [1, 0],
          [0, 1],
          [0, 0],
        ],
      ]);
      expect(editor.vertices).toHaveLength(3);
      expect(feature.properties.nombre).toBe('Prueba local');
      expect(feature.properties.estilo).toEqual(editor.estilo);
      expect(feature.properties.estilo).not.toBe(editor.estilo);
      expect(editor.geoJSONGenerado).toBe(feature);
      expect(editor.estadoGeometria).toBe('validada');
      expect(editor.estadoGeoJSON).toBe('generado');
      expect(editor.estadoVistaPrevia).toBe('pendiente');
      expect(editor.mensajeEstado).toContain('GEOJSON GENERADO EN MEMORIA');
      expect(editor.mensajeEstado).not.toContain('SVG ACTUALIZADA');
      editor.nombrePoligono = ' ';
      expect(editor.generarGeoJSON()).toBeNull();
    });

    it.each([
      [
        [0, 0],
        [0, 1],
      ],
      [
        [0, 0],
        [0, 1],
        [0, 2],
      ],
      [
        [0, 0],
        [1, 1],
        [0, 1],
        [1, 0],
      ],
      [
        [0, 0],
        [0, 1],
        [1, 1],
        [0, 1],
        [1, 0],
      ],
      [
        [0, 0],
        [0, 2],
        [0, 1],
        [1, 1],
        [1, 0],
      ],
      [
        [0, 0],
        [91, 1],
        [1, 0],
      ],
      [
        [0, 179],
        [1, -179],
        [0, -179],
      ],
    ])('refuses invalid or unsupported rings %j', (...coords: number[][]) => {
      editor.nombrePoligono = 'Prueba local';
      editor.vertices = coords.map(([latitud, longitud], i) => ({ id: i + 1, latitud, longitud }));
      expect(editor.generarGeoJSON()).toBeNull();
      expect(editor.geoJSONGenerado).toBeNull();
      expect(editor.estadoGeometria).toBe('invalida');
      expect(editor.estadoGeoJSON).toBe('pendiente');
      editor.graficar();
      expect(editor.mensajeEstado).not.toContain('ACTUALIZADA');
    });
  });

  it('shows only clear and graph in the footer and validates locally without HTTP', async () => {
    const fixture = TestBed.createComponent(VentanaLimitesSeguridad);
    fixture.detectChanges();
    const editor = fixture.componentInstance;
    const http = TestBed.inject(HttpTestingController);
    const host: HTMLElement = fixture.nativeElement;
    const botones = [...host.querySelectorAll<HTMLButtonElement>('.limits-footer-actions button')];
    expect(botones.map((b) => b.textContent?.trim())).toEqual(['LIMPIAR VÉRTICES', 'GRAFICAR']);
    expect(host.textContent).not.toContain('ARCHIVO GIS INDEPENDIENTE');
    expect(host.querySelector('a[routerLink]')).toBeNull();
    botones[1].click();
    expect(editor.mensajeEstado).toContain('FALTA EL NOMBRE');
    editor.nombrePoligono = 'Poligono local';
    botones[1].click();
    expect(editor.mensajeEstado).toContain('3 VERTICES');
    editor.vertices = [
      { id: 1, latitud: 0, longitud: 0 },
      { id: 2, latitud: 0, longitud: 1 },
      { id: 3, latitud: 1, longitud: 0 },
    ];
    botones[1].click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(editor.estadoGeometria).toBe('validada');
    expect(editor.estadoGeoJSON).toBe('generado');
    expect(editor.estadoVistaPrevia).toBe('actualizada');
    expect(editor.mensajeEstado).toContain('VISTA PREVIA SVG ACTUALIZADA');
    expect(editor.mensajeEstado).toContain('SIN ENVIO A MAPAS');
    expect(host.querySelector('polygon')).toBeTruthy();
    expect(host.querySelectorAll('circle')).toHaveLength(3);
    http.expectNone(() => true);
    botones[0].click();
    fixture.detectChanges();
    expect(editor.vertices).toEqual([]);
    expect(host.querySelector('polygon')).toBeNull();
    http.verify();
  });
});
