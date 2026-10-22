import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { HojaMilimetradaComponent } from '../../../pages/vulcano/hoja-milimetrada/hoja-milimetrada.component';
import { WindowManagerService } from './window-manager.service';
import { SimulacionTrayectoriaResponse } from '../../../core/services/vulcano-api.service';

describe('Persistent panel windows', () => {
  beforeEach(() => TestBed.configureTestingModule({
    imports: [HojaMilimetradaComponent],
    providers: [provideHttpClient(), provideHttpClientTesting()],
  }));
  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('places one PANELES launcher after CURVAS AUTO and toggles without changing window state', async () => {
    const fixture = TestBed.createComponent(HojaMilimetradaComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const manager = fixture.debugElement.injector.get(WindowManagerService);
    manager.float('ballistic');
    manager.minimize('ballistic');
    manager.float('piece');
    manager.toggleMaximize('piece');
    fixture.detectChanges();
    const windows = manager.windows();
    const launcher = fixture.nativeElement.querySelector('.plane-controls > .window-workspace-launcher') as HTMLDetailsElement;
    const toggle = launcher.querySelector('summary')!;
    expect(launcher.previousElementSibling?.textContent).toContain('CURVAS AUTO');
    expect(fixture.nativeElement.querySelectorAll('.window-workspace-launcher')).toHaveLength(1);
    expect(fixture.nativeElement.querySelector('app-window-workspace .window-workspace-launcher')).toBeNull();
    expect(toggle.textContent?.trim()).toBe('▸ PANELES (2)');
    toggle.click();
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(launcher.open).toBe(true);
    expect(toggle.textContent?.trim()).toBe('▾ PANELES (2)');
    expect(manager.windows()).toBe(windows);
    toggle.click();
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    expect(toggle.textContent?.trim()).toBe('▸ PANELES (2)');
    expect(manager.windows()).toBe(windows);
    expect(manager.get('ballistic')!.minimized).toBe(true);
    expect(manager.get('piece')!.maximized).toBe(true);
    fixture.destroy();
  });

  it('counts floating and minimized panels while ignoring geometry and integrated panels', async () => {
    const fixture = TestBed.createComponent(HojaMilimetradaComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const manager = fixture.debugElement.injector.get(WindowManagerService);
    const toggle = fixture.nativeElement.querySelector('.window-workspace-launcher summary') as HTMLElement;
    const expectCount = (count: number) => {
      fixture.detectChanges();
      expect(toggle.textContent?.trim()).toBe(`▸ PANELES (${count})`);
    };
    expectCount(0);
    manager.float('ballistic');
    expectCount(1);
    manager.minimize('ballistic');
    expectCount(1);
    manager.float('piece');
    expectCount(2);
    manager.toggleMaximize('piece');
    expectCount(2);
    manager.toggleMaximize('piece');
    manager.setRect('piece', { x: 10, y: 10, width: 400, height: 300 });
    manager.restore('ballistic');
    expectCount(2);
    manager.dock('piece');
    expectCount(1);
    const close = fixture.nativeElement.querySelector('[appFloatingPanel="ballistic"] .window-actions button:last-child') as HTMLButtonElement;
    close.click();
    expectCount(0);
    fixture.destroy();
  });

  it('preserves the ballistic DOM, SVG and live state through the full window lifecycle', async () => {
    const fixture = TestBed.createComponent(HojaMilimetradaComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const manager = fixture.debugElement.injector.get(WindowManagerService);
    const panel = fixture.nativeElement.querySelector('[appFloatingPanel="ballistic"]') as HTMLElement;
    const originalParent = panel.parentElement;
    const svg = panel.querySelector('svg');
    const component = fixture.componentInstance;
    const controls = component.controlManualPieza;
    const zoom = component.zoom();
    const http = TestBed.inject(HttpTestingController);
    http.expectNone(request => request.method === 'POST');
    panel.querySelector<HTMLButtonElement>('.window-detach-button')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(manager.get('ballistic')?.mode).toBe('floating');
    expect(panel.parentElement?.className).toBe('window-workspace-surface');
    expect(panel.querySelector('svg')).toBe(svg);
    manager.setBounds(1000, 700);
    manager.setRect('ballistic', { x: 30, y: 40, width: 420, height: 320 });
    const rect = manager.get('ballistic')!.rect;
    manager.minimize('ballistic');
    fixture.detectChanges();
    expect(panel.hidden).toBe(true);
    expect(fixture.nativeElement.querySelector('.window-workspace-taskbar').textContent).toContain('Orientación balística');
    manager.restore('ballistic');
    manager.toggleMaximize('ballistic');
    fixture.detectChanges();
    expect(panel.hidden).toBe(false);
    expect(panel.style.width).toBe('1000px');
    manager.toggleMaximize('ballistic');
    fixture.detectChanges();
    expect(manager.get('ballistic')!.rect).toEqual(rect);
    expect(panel.style.left).toBe('30px');
    manager.dock('ballistic');
    fixture.detectChanges();
    expect(panel.parentElement).toBe(originalParent);
    expect(panel.querySelector('svg')).toBe(svg);
    expect(component.controlManualPieza).toBe(controls);
    expect(component.zoom()).toBe(zoom);
    expect(fixture.nativeElement.querySelectorAll('[appFloatingPanel="ballistic"]')).toHaveLength(1);
    http.expectNone(request => request.method === 'POST');
    fixture.destroy();
  });

  it('bounds movement and size, retains restore geometry across fullscreen sizes', () => {
    const manager = new WindowManagerService();
    manager.register('a', 'Panel A');
    manager.register('b', 'Panel B');
    manager.setBounds(1000, 700);
    manager.float('a', { x: 100, y: 90, width: 500, height: 350 });
    const saved = manager.get('a')!.rect;
    manager.toggleMaximize('a');
    manager.setBounds(1400, 900);
    expect(manager.visibleRect(manager.get('a')!)).toEqual({ x: 0, y: 0, width: 1400, height: 900 });
    manager.minimize('a');
    manager.restore('a');
    expect(manager.get('a')!.maximized).toBe(true);
    manager.toggleMaximize('a');
    expect(manager.get('a')!.rect).toEqual(saved);
    manager.setBounds(320, 240);
    expect(manager.visibleRect(manager.get('a')!)).toEqual({ x: 0, y: 0, width: 320, height: 240 });
    manager.setBounds(1000, 700);
    expect(manager.visibleRect(manager.get('a')!)).toEqual(saved);
    manager.float('b');
    manager.front('a');
    expect(manager.get('a')!.z).toBeGreaterThan(manager.get('b')!.z);
    expect(manager.activeId()).toBe('a');
    manager.setRect('b', { x: -10, y: 9999, width: 1, height: 1 });
    expect(manager.get('b')!.rect).toEqual({ x: 0, y: 500, width: 280, height: 200 });
  });

  it('drags only the titlebar and resizes all eight edges within the workspace', async () => {
    const fixture = TestBed.createComponent(HojaMilimetradaComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const manager = fixture.debugElement.injector.get(WindowManagerService);
    manager.setBounds(1000, 700);
    manager.float('ballistic', { x: 100, y: 100, width: 400, height: 300 });
    fixture.detectChanges();
    const panel = fixture.nativeElement.querySelector('[appFloatingPanel="ballistic"]') as HTMLElement;
    const pointer = (target: EventTarget, type: string, x: number, y: number) => {
      const event = new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true });
      Object.defineProperty(event, 'pointerId', { value: 1 });
      target.dispatchEvent(event);
    };
    pointer(panel.querySelector('svg')!, 'pointerdown', 110, 110);
    pointer(window, 'pointerup', 200, 200);
    expect(manager.get('ballistic')!.rect.x).toBe(100);
    pointer(panel.querySelector('.window-titlebar')!, 'pointerdown', 110, 110);
    pointer(window, 'pointerup', 160, 140);
    expect(manager.get('ballistic')!.rect).toEqual({ x: 150, y: 130, width: 400, height: 300 });
    for (const edge of ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw']) {
      manager.setRect('ballistic', { x: 100, y: 100, width: 400, height: 300 });
      fixture.detectChanges();
      pointer(panel.querySelector(`.window-resize-${edge}`)!, 'pointerdown', 100, 100);
      pointer(window, 'pointerup', 120, 120);
      const rect = manager.get('ballistic')!.rect;
      expect(rect.width).toBe(edge.includes('e') ? 420 : edge.includes('w') ? 380 : 400);
      expect(rect.height).toBe(edge.includes('s') ? 320 : edge.includes('n') ? 280 : 300);
    }
    pointer(panel.querySelector('.window-titlebar')!, 'pointerdown', 0, 0);
    pointer(window, 'pointerup', 9999, 9999);
    const rect = manager.get('ballistic')!.rect;
    expect(rect.x + rect.width).toBeLessThanOrEqual(1000);
    expect(rect.y + rect.height).toBeLessThanOrEqual(700);
    fixture.destroy();
  });

  it('keeps the same floating DOM inside the native fullscreen element across transitions', async () => {
    const fixture = TestBed.createComponent(HojaMilimetradaComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const manager = fixture.debugElement.injector.get(WindowManagerService);
    const sheet = fixture.nativeElement.querySelector('.plotting-panel') as HTMLElement;
    const panel = fixture.nativeElement.querySelector('[appFloatingPanel="ballistic"]') as HTMLElement;
    manager.float('ballistic');
    fixture.detectChanges();
    const svg = panel.querySelector('svg');
    const original = Object.getOwnPropertyDescriptor(document, 'fullscreenElement');
    let fullscreen: Element | null = sheet;
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => fullscreen });
    try {
      for (let i = 0; i < 4; i++) {
        fullscreen = i % 2 === 0 ? sheet : null;
        document.dispatchEvent(new Event('fullscreenchange'));
        fixture.detectChanges();
        expect(sheet.contains(panel)).toBe(true);
        expect(panel.querySelector('svg')).toBe(svg);
        expect(manager.get('ballistic')!.mode).toBe('floating');
        expect(fixture.nativeElement.querySelectorAll('[appFloatingPanel="ballistic"]')).toHaveLength(1);
      }
      fullscreen = sheet;
      document.dispatchEvent(new Event('fullscreenchange'));
      manager.dock('ballistic');
      fixture.detectChanges();
      const launcher = fixture.nativeElement.querySelector('.window-workspace-launcher button') as HTMLButtonElement;
      launcher.click();
      fixture.detectChanges();
      expect(sheet.contains(panel)).toBe(true);
      expect(panel.querySelector('svg')).toBe(svg);
      expect(manager.get('ballistic')!.mode).toBe('floating');
    } finally {
      if (original) Object.defineProperty(document, 'fullscreenElement', original);
      else Reflect.deleteProperty(document, 'fullscreenElement');
      fixture.destroy();
    }
  });

  it('preserves all four panels, editable values, profile selection and live updates together', async () => {
    const fixture = TestBed.createComponent(HojaMilimetradaComponent);
    const component = fixture.componentInstance;
    const simulation: SimulacionTrayectoriaResponse = {
      simulacion: true,
      p1: { id: 'p1', latitud: 4, longitud: -74, elevacion_msnm: 100 },
      p2: { id: 'p2', latitud: 4.01, longitud: -74, elevacion_msnm: 120 },
      distancia_m: 1100,
      datos_simulados: { angulo_visual_grados: 35, carga_simulada: 2, apogeo_visual_m: 250 },
      apogeo: { latitud: 4.005, longitud: -74, terreno_msnm: 110, altura_visual_m: 250, altitud_visual_msnm: 360 },
      resumen_perfil: { elevacion_p1_msnm: 100, elevacion_p2_msnm: 120, elevacion_minima_msnm: 100,
        elevacion_maxima_msnm: 120, elevacion_media_msnm: 110, desnivel_p1_p2_m: 20, muestras: 2 },
      perfil_elevacion: [
        { indice: 0, factor: 0, distancia_m: 0, latitud: 4, longitud: -74, terreno_msnm: 100 },
        { indice: 1, factor: 1, distancia_m: 1100, latitud: 4.01, longitud: -74, terreno_msnm: 120 },
      ],
    } as SimulacionTrayectoriaResponse;
    fixture.componentRef.setInput('simulacionTrayectoria', simulation);
    fixture.detectChanges();
    await fixture.whenStable();
    const manager = fixture.debugElement.injector.get(WindowManagerService);
    manager.setBounds(1200, 800);
    const panels = Array.from(fixture.nativeElement.querySelectorAll('[appFloatingPanel]')) as HTMLElement[];
    const originals = panels.map(panel => ({ panel, parent: panel.parentElement, svg: panel.querySelector('svg') }));
    const profile = panels.find(panel => panel.getAttribute('appFloatingPanel') === 'profile')!;
    const piece = panels.find(panel => panel.getAttribute('appFloatingPanel') === 'piece')!;
    const profileSvg = profile.querySelector('svg');
    component.controlManualPieza.activo = true;
    component.controlManualPieza.direccionGrados = 123;
    component.controlManualPieza.elevacionGrados = 22;
    component.seleccionarPerfil('combinado');
    component.zoomPerfil.set(1.8);
    fixture.changeDetectorRef.markForCheck();
    fixture.detectChanges();
    const input = piece.querySelector('input') as HTMLInputElement;
    const inputValue = input.value;
    const viewBox = profileSvg?.getAttribute('viewBox');
    for (const panel of panels) panel.querySelector<HTMLButtonElement>('.window-detach-button')!.click();
    fixture.detectChanges();
    expect(manager.floating()).toHaveLength(4);
    expect(fixture.nativeElement.querySelectorAll('.window-workspace-surface > .vulcano-floating-panel')).toHaveLength(4);
    for (const window of manager.floating()) manager.minimize(window.id);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('.window-workspace-taskbar button')).toHaveLength(4);
    for (const button of Array.from(fixture.nativeElement.querySelectorAll('.window-workspace-taskbar button')) as HTMLButtonElement[]) button.click();
    fixture.detectChanges();
    expect(panels.every(panel => !panel.hidden)).toBe(true);
    for (const window of manager.floating()) manager.toggleMaximize(window.id);
    fixture.detectChanges();
    for (const window of manager.floating()) manager.toggleMaximize(window.id);
    fixture.detectChanges();
    expect(piece.querySelector('input')).toBe(input);
    expect(input.value).toBe(inputValue);
    expect(component.controlManualPieza.direccionGrados).toBe(123);
    expect(component.tipoPerfilVisual()).toBe('combinado');
    expect(component.zoomPerfil()).toBe(1.8);
    expect(profile.querySelector('svg')).toBe(profileSvg);
    expect(profileSvg?.getAttribute('viewBox')).toBe(viewBox);
    // Angular sigue actualizando el mismo contenido mientras esta trasladado.
    fixture.componentRef.setInput('simulacionTrayectoria', { ...simulation, distancia_m: 2200 });
    fixture.detectChanges();
    const data = panels.find(panel => panel.getAttribute('appFloatingPanel') === 'firing-data')!;
    expect(data.textContent).toContain(component.formatearDistancia(2200));
    expect(profile.querySelector('svg')).toBe(profileSvg);
    for (const original of originals) {
      manager.dock(original.panel.getAttribute('appFloatingPanel')!);
      fixture.detectChanges();
      expect(original.panel.parentElement).toBe(original.parent);
      expect(original.panel.querySelector('svg')).toBe(original.svg);
    }
    expect(component.simulacionTrayectoria?.distancia_m).toBe(2200);
    TestBed.inject(HttpTestingController).expectNone(() => true);
    fixture.destroy();
  });

  it('repeated opening and closing keeps a single panel and toolbar without HTTP or data resets', async () => {
    const fixture = TestBed.createComponent(HojaMilimetradaComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    const manager = fixture.debugElement.injector.get(WindowManagerService);
    const panel = fixture.nativeElement.querySelector('[appFloatingPanel="ballistic"]') as HTMLElement;
    const svg = panel.querySelector('svg');
    for (let i = 0; i < 12; i++) {
      panel.querySelector<HTMLButtonElement>('.window-detach-button')!.click();
      fixture.detectChanges();
      expect(panel.querySelectorAll('.window-titlebar')).toHaveLength(1);
      expect(panel.querySelectorAll('.window-resize-handle')).toHaveLength(8);
      panel.querySelector<HTMLButtonElement>('.window-actions button')!.click();
      fixture.detectChanges();
      expect(panel.hidden).toBe(true);
      fixture.nativeElement.querySelector('.window-workspace-taskbar button').click();
      fixture.detectChanges();
      expect(panel.hidden).toBe(false);
      const close = panel.querySelectorAll<HTMLButtonElement>('.window-actions button')[3];
      close.click();
      fixture.detectChanges();
      expect(manager.get('ballistic')!.mode).toBe('integrated');
      expect(panel.querySelector('svg')).toBe(svg);
      expect(panel.querySelectorAll('.window-titlebar')).toHaveLength(0);
      expect(fixture.nativeElement.querySelectorAll('[appFloatingPanel="ballistic"]')).toHaveLength(1);
    }
    expect(manager.windows()).toHaveLength(4);
    TestBed.inject(HttpTestingController).expectNone(() => true);
    fixture.destroy();
  });
});
