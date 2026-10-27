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
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }));

  it('preserves geometry and registers only presentation while minimizing, maximizing and closing', () => {
    const fixture = TestBed.createComponent(VentanaLimitesSeguridad);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const original = { ...component.rect };
    expect(component.manager.get(component.id)?.title).toBe('L\u00cdMITES DE SEGURIDAD');
    expect(fixture.nativeElement.querySelectorAll('.systems-resize')).toHaveLength(8);
    component.minimize(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.floating-window__content').hidden).toBe(true);
    component.restore(); component.toggleMaximize();
    expect(component.rect.width).toBe(window.innerWidth);
    component.toggleMaximize(); expect(component.rect).toEqual(original);
    const closed = vi.fn(); component.closed.subscribe(closed);
    component.close(); expect(closed).toHaveBeenCalledOnce();
    fixture.destroy(); expect(component.manager.get(component.id)).toBeUndefined();
  });

  it('moves within bounds and supports every edge and corner', () => {
    const fixture = TestBed.createComponent(VentanaLimitesSeguridad); fixture.detectChanges();
    const component = fixture.componentInstance;
    const target = document.createElement('header');
    const pointer = (x: number, y: number) => ({ button: 0, pointerId: 1, clientX: x, clientY: y, target,
      currentTarget: target, preventDefault() {}, stopPropagation() {} }) as unknown as PointerEvent;
    component.startPointer(pointer(0, 0)); component.endPointer(pointer(-10000, -10000));
    expect(component.rect.x).toBe(0); expect(component.rect.y).toBe(0);
    for (const edge of component.edges) {
      component.manager.setRect(component.id, { x: 100, y: 100, width: 500, height: 350 });
      const before = { ...component.rect };
      component.startPointer(pointer(0, 0), edge); component.endPointer(pointer(15, 15));
      expect(component.rect).not.toEqual(before);
      expect(component.rect.width).toBeGreaterThanOrEqual(420);
      expect(component.rect.height).toBeGreaterThanOrEqual(300);
    }
  });

  it('opens the same instance from map and piece, restores it, and permits reopening after close', async () => {
    const menuFixture = TestBed.createComponent(Menu); menuFixture.detectChanges();
    const menu = menuFixture.componentInstance;
    const parent = TestBed.createComponent(Vulcano);
    (parent.componentInstance as any).menuRef = menu;
    const hoja = TestBed.createComponent(HojaMilimetradaComponent);
    hoja.componentInstance.abrirLimitesSeguridad.subscribe(() => menu.openLimitesWindow());
    const service = TestBed.inject(MapActionsService);
    const host = document.createElement('div'); document.body.append(host);
    service.open(host, { latitud: 4, longitud: -74 }, new MouseEvent('contextmenu', { cancelable: true }));
    expect(host.querySelectorAll('button')).toHaveLength(3);
    const projection = vi.spyOn(hoja.componentInstance, 'abrirProyeccionDesdeMapa');
    (parent.componentInstance as any).hojaMilimetradaRef = hoja.componentInstance;
    host.querySelectorAll('button')[2].click();
    menuFixture.detectChanges(); await menuFixture.whenStable();
    const first = menuFixture.nativeElement.querySelector('app-ventana-limites-seguridad');
    expect(first).toBeTruthy(); expect(projection).not.toHaveBeenCalled();
    first.querySelector('[title="Minimizar"]').click(); menuFixture.detectChanges();
    hoja.componentInstance.solicitarLimitesSeguridad(); menuFixture.detectChanges();
    expect(menuFixture.nativeElement.querySelector('app-ventana-limites-seguridad')).toBe(first);
    expect(first.querySelector('.floating-window__content').hidden).toBe(false);
    const z = menu.limitesWindowZIndex;
    menu.activateExistingWindow('graficar'); expect(menu.graficarWindowZIndex).toBeGreaterThan(z);
    menu.openLimitesWindow(); expect(menu.limitesWindowZIndex).toBeGreaterThan(menu.graficarWindowZIndex);
    first.querySelector('[title="Cerrar"]').click(); menuFixture.detectChanges();
    expect(menuFixture.nativeElement.querySelector('app-ventana-limites-seguridad')).toBeNull();
    menu.openLimitesWindow(); menuFixture.detectChanges();
    expect(menuFixture.nativeElement.querySelectorAll('app-ventana-limites-seguridad')).toHaveLength(1);
    host.remove(); service.close();
  });
});
