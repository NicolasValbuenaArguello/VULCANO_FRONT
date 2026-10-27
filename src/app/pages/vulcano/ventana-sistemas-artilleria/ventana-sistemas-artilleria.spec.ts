import { ComponentFixture, TestBed } from '@angular/core/testing';

import { VentanaSistemasArtilleria } from './ventana-sistemas-artilleria';

describe('VentanaSistemasArtilleria', () => {
  let component: VentanaSistemasArtilleria;
  let fixture: ComponentFixture<VentanaSistemasArtilleria>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [VentanaSistemasArtilleria],
    }).compileComponents();

    fixture = TestBed.createComponent(VentanaSistemasArtilleria);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('preserves normal geometry through minimizing and maximizing with the menu hidden', () => {
    const original = { ...component.rect };
    component.minimize();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.floating-window__content').hidden).toBe(true);
    component.restore();
    component.toggleMaximize();
    expect(component.rect.width).toBe(window.innerWidth);
    component.toggleMaximize();
    expect(component.rect).toEqual(original);
    expect(fixture.nativeElement.querySelectorAll('app-menu-sistemas')).toHaveLength(1);
  });

  it('receives distinct menu destinations and preserves selection through window controls', () => {
    const host: HTMLElement = fixture.nativeElement;
    const tabs = host.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    const original = { ...component.rect };
    tabs[5].click();
    fixture.detectChanges();
    expect(component.componenteActivo).toBe('trabajos-2');
    expect(host.querySelector('[role="tabpanel"]')?.getAttribute('data-componente')).toBe('trabajos-2');
    expect(host.textContent).toContain('Componente pendiente de implementación');
    component.minimize();
    fixture.detectChanges();
    expect(host.querySelector<HTMLElement>('.floating-window__content')?.hidden).toBe(true);
    component.restore();
    component.toggleMaximize();
    component.toggleMaximize();
    fixture.detectChanges();
    expect(component.componenteActivo).toBe('trabajos-2');
    expect(component.rect).toEqual(original);
    expect(tabs[5].getAttribute('aria-selected')).toBe('true');
  });

  it('moves within bounds and resizes from the northwest corner', () => {
    const target = document.createElement('header');
    const pointer = (x: number, y: number) => ({ button: 0, pointerId: 1, clientX: x, clientY: y,
      target, currentTarget: target, preventDefault() {}, stopPropagation() {} }) as unknown as PointerEvent;
    component.startPointer(pointer(0, 0));
    component.movePointer(pointer(-10000, -10000));
    component.stopPointer();
    expect(component.rect.x).toBe(0);
    expect(component.rect.y).toBe(0);
    const before = { ...component.rect };
    component.startPointer(pointer(0, 0), 'nw');
    component.movePointer(pointer(20, 20));
    component.stopPointer();
    expect(component.rect.x).toBe(20);
    expect(component.rect.width).toBe(before.width - 20);
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('shows the existing Piezas component only for graficar-piezas without duplicates', () => {
    const host: HTMLElement = fixture.nativeElement;
    expect(host.querySelectorAll('app-piezas')).toHaveLength(1);
    const tabs = host.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    for (let index = 1; index < tabs.length; index++) {
      tabs[index].click(); fixture.detectChanges();
      expect(host.querySelector('app-piezas')).toBeNull();
      expect(host.querySelector('.contenido-provisional')).toBeTruthy();
    }
    tabs[0].click(); fixture.detectChanges();
    const piezas = host.querySelector('app-piezas');
    component.minimize(); fixture.detectChanges();
    component.restore(); component.toggleMaximize(); fixture.detectChanges();
    expect(host.querySelector('app-piezas')).toBe(piezas);
    expect(host.querySelectorAll('app-piezas')).toHaveLength(1);
  });
});
