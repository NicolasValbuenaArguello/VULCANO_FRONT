import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ElementoLocalDemo } from '../../../shared/models/elemento-local-demo.model';
import { HojaMilimetradaComponent } from './hoja-milimetrada.component';

describe('HojaMilimetradaComponent', () => {
  const record: ElementoLocalDemo = {
    id: 'local-test',
    name: 'Local',
    x: 20,
    y: 30,
    icon: 'M 0 -7 A 7 7 0 1 1 0 7 A 7 7 0 1 1 0 -7 Z',
    color: '#5ca4ff',
  };

  beforeEach(() => TestBed.configureTestingModule({
    imports: [HojaMilimetradaComponent],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  }));

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('formats cursor DMS hemispheres, rounding carries and decimal round trips', () => {
    const fixture = TestBed.createComponent(HojaMilimetradaComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const format = (value: number, latitude: boolean) => component.formatearCursorDms(value, latitude);
    expect(format(3.424869, true)).toBe('LN 03\u00b0 25\' 29.53"');
    expect(format(-3.424869, true)).toBe('LS 03\u00b0 25\' 29.53"');
    expect(format(75.424528, false)).toBe('LE 75\u00b0 25\' 28.30"');
    expect(format(-75.424528, false)).toBe('LW 75\u00b0 25\' 28.30"');
    expect(format(3 + (25 * 60 + 59.999) / 3600, true)).toBe('LN 03\u00b0 26\' 00.00"');
    expect(format(3 + (59 * 60 + 59.999) / 3600, true)).toBe('LN 04\u00b0 00\' 00.00"');
    expect(format(0, true)).toBe('LN 00\u00b0 00\' 00.00"');
    expect(format(0, false)).toBe('LE 00\u00b0 00\' 00.00"');
    for (const value of [3.424869, -3.424869, 75.424528, -75.424528, 179.9999999]) {
      const parts = format(value, false).match(/(\d+)\D+(\d+)\D+(\d+\.\d+)/)!;
      const recovered = (Number(parts[1]) + Number(parts[2]) / 60 + Number(parts[3]) / 3600) * (value < 0 ? -1 : 1);
      expect(Math.abs(recovered - value)).toBeLessThanOrEqual(0.005 / 3600 + 1e-12);
    }
  });

  it('recovers stored P1/P2 coordinates through zoom and pan without HTTP requests', () => {
    const fixture = TestBed.createComponent(HojaMilimetradaComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('registrosCoordenadas', [
      { id: 'p1', tipo_graficacion: 'Pieza', nombre: 'P1', latitud: 3.425, longitud: -75.425 },
      { id: 'p2', tipo_graficacion: 'Pieza', nombre: 'P2', latitud: 3.426, longitud: -75.424 },
    ]);
    fixture.detectChanges();
    for (const factor of [1, 1.25, 0.8]) {
      component.zoomBy(factor);
      component.center.update(center => ({ x: center.x + 25, y: center.y - 15 }));
      for (const element of component.elements) {
        component.pointer.set(component.toScreen(element));
        const geo = component.cursorGeografico();
        expect(geo).not.toBeNull();
        expect(Math.abs(geo!.latitud - element.latitud!)).toBeLessThan(1e-9);
        expect(Math.abs(geo!.longitud - element.longitud!)).toBeLessThan(1e-9);
      }
      const { width, height } = component.viewport();
      for (const point of [{ x: width / 2, y: height / 2 }, { x: 0, y: 0 }, { x: width, y: height }]) {
        component.pointer.set(point);
        const geo = component.cursorGeografico()!;
        const roundTrip = (component as any).convertirWgs84AOrigenNacional(geo.longitud, geo.latitud);
        expect(Math.abs(roundTrip.x - component.cursor()!.x)).toBeLessThan(0.0001);
        expect(Math.abs(roundTrip.y - component.cursor()!.y)).toBeLessThan(0.0001);
      }
    }
    TestBed.inject(HttpTestingController).expectNone(() => true);
  });

  it('updates the floating cursor once per frame and clears it on leave', async () => {
    const fixture = TestBed.createComponent(HojaMilimetradaComponent);
    fixture.componentRef.setInput('registrosCoordenadas', [
      { id: 'p1', tipo_graficacion: 'Pieza', nombre: 'P1', latitud: 3.425, longitud: -75.425 },
    ]);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const svg = fixture.nativeElement.querySelector('.coordinate-plot');
    svg.getBoundingClientRect = () => ({ left: 10, top: 20, width: 440, height: 220 });
    component.onPointerMove({ clientX: 230, clientY: 130, pointerId: 1 } as PointerEvent);
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    fixture.detectChanges();
    expect(component.pointer()).toEqual({ x: 440, y: 220 });
    expect(fixture.nativeElement.querySelector('.geographic-cursor').textContent).toContain('3.425000');
    expect(fixture.nativeElement.querySelector('.geographic-cursor').textContent).toContain('LN 03\u00b0 25\' 30.00"');
    expect(fixture.nativeElement.querySelector('.geographic-cursor').textContent).toContain('LW 75\u00b0 25\' 30.00"');
    component.onPointerMove({ clientX: 240, clientY: 140, pointerId: 1 } as PointerEvent);
    component.onPointerLeave();
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
    fixture.detectChanges();
    expect(component.pointer()).toBeNull();
    expect(fixture.nativeElement.querySelector('.geographic-cursor')).toBeNull();
  });

  it('opens and closes empty without requesting demo points', async () => {
    const fixture = TestBed.createComponent(HojaMilimetradaComponent);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.querySelectorAll('.demo-element')).toHaveLength(0);
    expect(fixture.nativeElement.querySelector('.demo-state').textContent).toContain('Sin registros para mostrar');
    expect(fixture.nativeElement.querySelectorAll('.local-grid line').length).toBeGreaterThan(5);
    TestBed.inject(HttpTestingController).expectNone('/api/demo-points');

    fixture.destroy();
    TestBed.inject(HttpTestingController).expectNone('/api/demo-points');
  });

  it('renders a valid local record while preserving zoom and displacement controls', async () => {
    const fixture = TestBed.createComponent(HojaMilimetradaComponent);
    fixture.componentRef.setInput('registrosLocales', [record]);
    fixture.detectChanges();
    await fixture.whenStable();

    const component = fixture.componentInstance;
    const marker = fixture.nativeElement.querySelector('.demo-element');
    expect(component.elements).toEqual([record]);
    expect(marker).not.toBeNull();
    const zoomInicial = component.zoom();
    component.zoomBy(1.25);
    expect(component.zoom()).toBeCloseTo(zoomInicial * 1.25);
    TestBed.inject(HttpTestingController).expectNone('/api/demo-points');
  });

  it('merges individual WGS84 responses and fits every accumulated point in the viewport', () => {
    const fixture = TestBed.createComponent(HojaMilimetradaComponent);
    const component = fixture.componentInstance;
    const p1 = { id: 'p1', tipo_graficacion: 'Pieza', nombre: 'P1', latitud: 3.425, longitud: -75.425 };
    const p2 = { id: 'p2', tipo_graficacion: 'Pieza', nombre: 'P2', latitud: 3.426, longitud: -75.424 };
    const p3 = { id: 'p3', tipo_graficacion: 'Pieza', nombre: 'P3', latitud: 3.427, longitud: -75.423 };

    fixture.componentRef.setInput('registrosCoordenadas', [p1]);
    fixture.detectChanges();
    const projectedP1 = component.elements[0];

    fixture.componentRef.setInput('registrosCoordenadas', [p2]);
    fixture.detectChanges();
    fixture.componentRef.setInput('registrosCoordenadas', [p3]);
    fixture.detectChanges();

    expect(component.elements).toHaveLength(3);
    expect(component.elements[0]).toMatchObject({ id: 'p1', latitud: 3.425, longitud: -75.425 });
    expect(component.elements[0].x).toBe(projectedP1.x);
    expect(component.elements[0].y).toBe(projectedP1.y);
    expect(component.elements[0].x).not.toBe(0);
    expect(component.elements[0].y).not.toBe(0);
    expect(component.elements[1].x).not.toBe(component.elements[0].x);
    expect(component.elements[1].y).not.toBe(component.elements[0].y);
    expect(component.elements[0].projectedX).toBe(component.elements[0].x);
    expect(component.elements[0].projectedY).toBe(component.elements[0].y);
    for (const element of component.elements) {
      expect(Number.isFinite(element.x)).toBe(true);
      expect(Number.isFinite(element.y)).toBe(true);
      const screen = component.toScreen(element);
      expect(screen.x).toBeGreaterThanOrEqual(0);
      expect(screen.x).toBeLessThanOrEqual(component.viewport().width);
      expect(screen.y).toBeGreaterThanOrEqual(0);
      expect(screen.y).toBeLessThanOrEqual(component.viewport().height);
    }

    const centerAfterP3 = component.center();
    const zoomAfterP3 = component.zoom();
    fixture.componentRef.setInput('registrosCoordenadas', [p2]);
    fixture.detectChanges();

    expect(component.elements.map(element => element.id)).toEqual(['p1', 'p2', 'p3']);
    expect(component.center()).toEqual(centerAfterP3);
    expect(component.zoom()).toBe(zoomAfterP3);
    expect(fixture.nativeElement.querySelectorAll('.demo-element')).toHaveLength(3);
  });

  it('rejects non-finite coordinates and duplicate identifiers without substituting values', async () => {
    const fixture = TestBed.createComponent(HojaMilimetradaComponent);
    fixture.componentRef.setInput('registrosLocales', [
      record,
      { ...record, x: 90 },
      { ...record, id: 'invalid-x', x: Number.NaN },
      { ...record, id: 'invalid-y', y: Infinity },
    ]);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.componentInstance.elements).toEqual([record]);
    expect(fixture.nativeElement.querySelectorAll('.demo-element')).toHaveLength(1);
    expect(fixture.nativeElement.innerHTML).not.toContain('translate(NaN');
    expect(fixture.nativeElement.innerHTML).not.toContain('translate(Infinity');
    TestBed.inject(HttpTestingController).expectNone('/api/demo-points');
  });

  it('keeps distinct records when their names are duplicated and preserves them through zoom', () => {
    const fixture = TestBed.createComponent(HojaMilimetradaComponent);
    const component = fixture.componentInstance;
    const records = [
      { id: 'uuid-A', tipo_graficacion: 'Pieza', nombre: 'P1', latitud: 3.425, longitud: -75.425 },
      { id: 'uuid-B', tipo_graficacion: 'Pieza', nombre: 'P1', latitud: 3.7583333333, longitud: -75.5696444444 },
      { id: 'uuid-C', tipo_graficacion: 'Pieza', nombre: 'P2', latitud: 4, longitud: -75.7 },
    ];
    fixture.componentRef.setInput('registrosCoordenadas', records);
    fixture.detectChanges();

    const ids = component.elements.map(element => element.id);
    const coordinates = component.elements.map(({ id, x, y }) => ({ id, x, y }));
    component.zoomBy(1.25);
    fixture.detectChanges();

    expect(component.elements).toHaveLength(3);
    expect(component.elements.map(element => element.id)).toEqual(ids);
    expect(component.elements.map(({ id, x, y }) => ({ id, x, y }))).toEqual(coordinates);
    expect(fixture.nativeElement.querySelectorAll('.demo-element')).toHaveLength(3);
  });

  it('creates and replaces a fixed relation without removing its points', () => {
    const fixture = TestBed.createComponent(HojaMilimetradaComponent);
    const component = fixture.componentInstance;
    fixture.componentRef.setInput('registrosCoordenadas', [
      { id: 'p1', tipo_graficacion: 'Pieza', nombre: 'P1', latitud: 3.425, longitud: -75.425 },
      { id: 'p2', tipo_graficacion: 'Pieza', nombre: 'P2', latitud: 3.426, longitud: -75.424 },
      { id: 'p3', tipo_graficacion: 'Pieza', nombre: 'P3', latitud: 3.427, longitud: -75.423 },
    ]);
    fixture.detectChanges();

    (component as any).contextId.set('p1');
    component.fijarElemento();
    component.openElement(new Event('click'), component.elements[0]);
    expect(component.relacion()).toBeNull();
    component.openElement(new Event('click'), component.elements[1]);
    expect(component.relacion()?.origenId).toBe('p1');
    expect(component.relacion()?.destinoId).toBe('p2');
    expect(component.relacion()?.distanciaMetros).toBeGreaterThan(0);
    expect(component.relacion()?.azimutGrados).toBeGreaterThanOrEqual(0);
    expect(component.relacion()?.azimutGrados).toBeLessThan(360);

    (component as any).contextId.set('p2');
    component.fijarElemento();
    component.openElement(new Event('click'), component.elements[2]);
    expect(component.relacion()?.origenId).toBe('p2');
    expect(component.relacion()?.destinoId).toBe('p3');
    expect(component.elements).toHaveLength(3);
  });

  it('calculates cardinal azimuths from projected coordinates', () => {
    const fixture = TestBed.createComponent(HojaMilimetradaComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance as any;
    const point = (id: string, x: number, y: number) => ({ id, name: id, x, y, latitud: 4, longitud: -74, icon: '', color: '' });
    const origin = point('o', 0, 0);
    const azimuthTo = (target: any) => {
      component.crearRelacion(origin, target);
      return component.relacion().azimutGrados;
    };

    expect(azimuthTo(point('n', 0, 1))).toBe(0);
    expect(azimuthTo(point('e', 1, 0))).toBe(90);
    expect(azimuthTo(point('s', 0, -1))).toBe(180);
    expect(azimuthTo(point('w', -1, 0))).toBe(270);
  });
});
