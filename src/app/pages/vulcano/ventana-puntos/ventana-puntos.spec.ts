import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VentanaPuntos } from './ventana-puntos';
import { GeographicPointsService } from '../../../shared/geographic-points/geographic-points';
import { vi } from 'vitest';
import { localPointRemoteFixture } from '../../../shared/geographic-points/point-remote-test.fixture';

describe('VentanaPuntos', () => {
  let component: VentanaPuntos;
  let fixture: ComponentFixture<VentanaPuntos>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      providers: [localPointRemoteFixture],
      imports: [VentanaPuntos],
    }).compileComponents();

    fixture = TestBed.createComponent(VentanaPuntos);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('converts actual decimal and DMS inputs and deletes only the confirmed record', async () => {
    fixture.detectChanges();
    const decimal: HTMLInputElement = fixture.nativeElement.querySelector('[aria-label="Latitud decimal"]');
    decimal.value = '-3.5'; decimal.dispatchEvent(new Event('input'));
    fixture.detectChanges(); await fixture.whenStable();
    expect(component.latDms).toMatchObject({ hemisferio: 'S', grados: 3, minutos: 30, segundos: 0 });
    const seconds: HTMLInputElement = fixture.nativeElement.querySelector('[aria-label="Segundos latitud"]');
    seconds.value = '30'; seconds.dispatchEvent(new Event('input'));
    fixture.detectChanges(); await fixture.whenStable();
    expect(component.latitud).toBeCloseTo(-3.5083333333333333, 10);
    component.nombre = 'A'; await component.agregar(); component.nombre = 'B'; await component.agregar();
    const state = TestBed.inject(GeographicPointsService);
    const first = state.registros()[0], second = state.registros()[1];
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    try {
      await component.eliminar(first); expect(state.registros()).toHaveLength(2);
      confirm.mockReturnValue(true); await component.eliminar(first);
      expect(state.registros().map(p => p.id)).toEqual([second.id]);
    } finally { confirm.mockRestore(); }
  });

  it('captures, registers several styled points and recovers the list after destruction', async () => {
    fixture.detectChanges();
    component.seleccionarMapa();
    const state = TestBed.inject(GeographicPointsService);
    state.capturar({ latitud: -33.125, longitud: 151.75 });
    fixture.detectChanges();
    expect(component.latDms.hemisferio).toBe('S'); expect(component.lonDms.hemisferio).toBe('E');
    expect(component.latitud).toBe(-33.125); expect(state.registros()).toHaveLength(0);
    component.nombre = 'Primero'; component.observaciones = 'Observación'; await component.agregar();
    component.nombre = 'Segundo'; component.estilo.radio = 2000; component.estilo.relleno = '#ff0000'; await component.agregar();
    expect(state.registros()).toHaveLength(2);
    state.graficar(); state.graficar(); expect(state.geometria().features).toHaveLength(4);
    component.editar(state.registros()[0]); component.estilo.opacidad = .7; await component.agregar();
    expect(state.registros()[0].opacidad).toBe(.7); expect(state.registros()[1].radio).toBe(2000);
    fixture.destroy();
    fixture = TestBed.createComponent(VentanaPuntos); component = fixture.componentInstance;
    fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(fixture.nativeElement.textContent).toContain('Primero');
    expect(state.registros()[0].observaciones).toBe('Observación');
  });

  it('drags and resizes within bounds, preserving geometry on minimize and maximize', () => {
    fixture.detectChanges();
    const original = { ...component.rect };
    const pointer = (type: string, x: number, y: number) => {
      const event = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      return event;
    };
    const header: HTMLElement = fixture.nativeElement.querySelector('header');
    header.dispatchEvent(pointer('pointerdown', 100, 100));
    window.dispatchEvent(pointer('pointermove', 120, 120));
    window.dispatchEvent(pointer('pointerup', 120, 120));
    expect(component.rect.x).toBe(original.x + 20);
    expect(component.rect.y).toBe(original.y + 20);
    fixture.detectChanges();
    const moved = { ...component.rect };
    fixture.nativeElement.querySelector('.systems-resize--se').dispatchEvent(pointer('pointerdown', 0, 0));
    window.dispatchEvent(pointer('pointerup', -10000, -10000));
    expect(component.rect.width).toBe(420);
    expect(component.rect.height).toBe(300);
    const resized = { ...component.rect };
    component.minimize(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.puntos-content').hidden).toBe(true);
    component.restore(); fixture.detectChanges();
    expect(component.rect).toEqual(resized);
    component.toggleMaximize(); fixture.detectChanges();
    expect(component.rect.width).toBe(window.innerWidth);
    component.toggleMaximize(); fixture.detectChanges();
    expect(component.rect).toEqual(resized);
    // Los botones no deben iniciar un arrastre.
    const button: HTMLElement = fixture.nativeElement.querySelector('header button');
    button.dispatchEvent(pointer('pointerdown', 0, 0));
    window.dispatchEvent(pointer('pointerup', 100, 100));
    expect(component.rect).toEqual(resized);
    expect(moved.x).toBeGreaterThanOrEqual(0);
    expect(fixture.nativeElement.querySelectorAll('.systems-resize')).toHaveLength(8);
  });
});
