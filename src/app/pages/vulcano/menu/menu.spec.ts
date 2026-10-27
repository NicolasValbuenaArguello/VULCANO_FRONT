import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Menu } from './menu';
import { By } from '@angular/platform-browser';
import { Graficar } from '../graficar/graficar';

describe('Menu', () => {
  let component: Menu;
  let fixture: ComponentFixture<Menu>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Menu],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(Menu);
    component = fixture.componentInstance;
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('opens one Systems instance, restores it from the menu and destroys it on close', async () => {
    const option = component.menuItems.find(item => item.action === 'abrir-ventana-sistemas-artilleria')!;
    component.onMenuClick(option);
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    await fixture.whenStable();
    const host = fixture.nativeElement.querySelector('app-ventana-sistemas-artilleria');
    host.querySelector('[title="Minimizar"]').click();
    component.onMenuClick(option);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('app-ventana-sistemas-artilleria')).toHaveLength(1);
    expect(host.querySelector('.floating-window__content').hidden).toBe(false);
    host.querySelector('[title="Cerrar"]').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('app-ventana-sistemas-artilleria')).toBeNull();
  });

  it('shares foreground ordering when opening, selecting and reopening windows', () => {
    component.openSistemasWindow();
    component.openGraficarWindow();
    expect(component.graficarWindowZIndex).toBeGreaterThan(component.sistemasWindowZIndex);
    component.openIconosWindow();
    expect(component.iconosWindowZIndex).toBeGreaterThan(component.graficarWindowZIndex);
    component.activateSistemasWindow();
    expect(component.sistemasWindowZIndex).toBeGreaterThan(component.iconosWindowZIndex);
    component.activateExistingWindow('graficar');
    expect(component.graficarWindowZIndex).toBeGreaterThan(component.sistemasWindowZIndex);
    component.openIconosWindow();
    expect(component.iconosWindowZIndex).toBeGreaterThan(component.graficarWindowZIndex);
    component.openGraficarWindow();
    expect(component.graficarWindowZIndex).toBeGreaterThan(component.iconosWindowZIndex);
  });

  it('reuses the open form and reopens it after closing', async () => {
    component.onMenuClick(component.menuItems[0]);
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    await fixture.whenStable();
    const form = fixture.nativeElement.querySelector('app-graficar');
    component.openGraficarWindow();
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('app-graficar').length).toBe(1);
    expect(fixture.nativeElement.querySelector('app-graficar')).toBe(form);
    component.closeGraficarWindow();
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('app-graficar')).toBeNull();
    component.openGraficarWindow();
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(fixture.nativeElement.querySelectorAll('app-graficar').length).toBe(1);
  });

  it('preserves the form and icon catalog when entering and leaving fullscreen', async () => {
    component.openGraficarWindow();
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    await fixture.whenStable();
    const container = fixture.nativeElement.lastElementChild;
    const form = container.querySelector('app-graficar');
    const fullscreen = document.createElement('div');
    document.body.appendChild(fullscreen);
    const originalFullscreen = Object.getOwnPropertyDescriptor(document, 'fullscreenElement');
    let activeFullscreen: Element | null = null;
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => activeFullscreen });
    try {
      activeFullscreen = fullscreen;
      document.dispatchEvent(new Event('fullscreenchange'));
      expect(fullscreen.contains(form)).toBe(true);
      component.openGraficarWindow();
      component.openIconosWindow();
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(fullscreen.querySelectorAll('app-graficar').length).toBe(1);
      expect(fullscreen.querySelector('app-graficar')).toBe(form);
      expect(fullscreen.querySelector('app-iconos')).toBeTruthy();
      activeFullscreen = null;
      document.dispatchEvent(new Event('fullscreenchange'));
      expect(fixture.nativeElement.contains(form)).toBe(true);
      expect(fullscreen.childElementCount).toBe(0);
      component.closeGraficarWindow();
      fixture.changeDetectorRef.markForCheck();
      fixture.detectChanges();
      await fixture.whenStable();
      expect(fixture.nativeElement.querySelector('app-graficar')).toBeNull();
    } finally {
      if (originalFullscreen) {
        Object.defineProperty(document, 'fullscreenElement', originalFullscreen);
      } else {
        Reflect.deleteProperty(document, 'fullscreenElement');
      }
      fullscreen.remove();
    }
  });

  it('preloads exact map coordinates in the same form without clearing other fields', async () => {
    const point = { latitud: -3.456789123, longitud: 75.123456789 };
    component.openGraficarWindow(point);
    fixture.detectChanges();
    await fixture.whenStable();
    const form = fixture.debugElement.query(By.directive(Graficar)).componentInstance as Graficar;
    expect(form.latitud.decimal).toBe(point.latitud);
    expect(form.longitud.decimal).toBe(point.longitud);
    expect(form.hemisferioLatitud).toBe('LS');
    expect(form.hemisferioLongitud).toBe('LE');
    form.configuracion2 = 'Nombre en edicion';
    form.iconoSeleccionado = 'icono-elegido';
    component.openGraficarWindow({ latitud: 4.123456789, longitud: -74.987654321 });
    fixture.detectChanges();
    expect(fixture.debugElement.query(By.directive(Graficar)).componentInstance).toBe(form);
    expect(form.configuracion2).toBe('Nombre en edicion');
    expect(form.iconoSeleccionado).toBe('icono-elegido');
    expect(form.latitud.decimal).toBe(4.123456789);
    expect(form.longitud.decimal).toBe(-74.987654321);
    expect(fixture.nativeElement.querySelectorAll('app-graficar')).toHaveLength(1);
  });

  it('opens inside fullscreen even when it starts before the fullscreenchange listener runs', () => {
    const fullscreen = document.createElement('div');
    document.body.append(fullscreen);
    const original = Object.getOwnPropertyDescriptor(document, 'fullscreenElement');
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreen });
    try {
      component.openGraficarWindow({ latitud: 4, longitud: -74 });
      fixture.detectChanges();
      expect(fullscreen.querySelectorAll('app-graficar')).toHaveLength(1);
    } finally {
      if (original) Object.defineProperty(document, 'fullscreenElement', original);
      else Reflect.deleteProperty(document, 'fullscreenElement');
      component.syncFloatingWindowsHost();
      fullscreen.remove();
    }
  });

  it('should create', () => {
    expect(component).toBeTruthy();
    expect(component.menuItems.some(item => item.name === 'INFORME')).toBe(false);
    expect(fixture.nativeElement.querySelector('nav').textContent).not.toContain('INFORME');
  });
});
