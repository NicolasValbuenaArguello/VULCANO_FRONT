import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import * as L from 'leaflet';
import { vi } from 'vitest';
import { MapaComponent } from '../mapa/mapa';
import { MapaTresD } from '../../../pages/vulcano/mapa-tres-d/mapa-tres-d';

describe('Map layers controls', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }));

  it('shows five Leaflet options but initializes and permits only satellite', () => {
    const component = TestBed.runInInjectionContext(() => new MapaComponent()) as any;
    const viewport = document.createElement('div');
    document.body.append(viewport);
    const map = L.map(viewport).setView([4, -74], 6);
    component.map = map;
    map.on('baselayerchange', component.handleBaseLayerChange);
    component.initializeBaseMaps();
    const control = component.baseLayerControl as L.Control.Layers;
    const root = control.getContainer()!;
    const toggle = root.querySelector<HTMLAnchorElement>('a')!;
    const radios = Array.from(root.querySelectorAll<HTMLInputElement>('input[type="radio"]'));
    try {
      expect(radios).toHaveLength(5);
      expect(root.textContent).toContain('MAPAS Y CAPAS');
      expect(toggle.title).toBe('Capas del mapa');
      toggle.click();
      expect(toggle.getAttribute('aria-expanded')).toBe('true');
      toggle.click();
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(radios.map(input => input.disabled)).toEqual([true, false, true, true, true]);
      expect(radios[1].checked).toBe(true);
      expect(Object.keys(component.baseLayers)).toEqual(['satellite']);
      for (const index of [0, 2, 3, 4]) {
        radios[index].click();
        expect(component.activeBaseMapKey).toBe('satellite');
      }
      map.fire('zoomend');
      expect(radios.map(input => input.disabled)).toEqual([true, false, true, true, true]);
      expect(map.hasLayer(component.baseLayers.satellite)).toBe(true);
      const gesture = vi.fn();
      viewport.addEventListener('mousedown', gesture);
      root.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      expect(gesture).not.toHaveBeenCalled();
      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      expect(viewport.contains(root)).toBe(true);
    } finally {
      component.disposeBaseLayerControl();
      map.remove();
      component.map = null;
      viewport.remove();
    }
  });

  it('disables four MapLibre options and preserves satellite selection and gestures', () => {
    const component = TestBed.runInInjectionContext(() => new MapaTresD()) as any;
    const viewport = document.createElement('div');
    document.body.append(viewport);
    const map = { addControl: vi.fn(), getContainer: () => viewport };
    component.map = map;
    const change = vi.spyOn(component, 'changeBaseMap').mockImplementation(() => {});
    component.addControls();
    const control = component.baseMapControl;
    const root = control.onAdd(map) as HTMLElement;
    viewport.append(root);
    const toggle = root.querySelector<HTMLButtonElement>('button')!;
    const panel = root.querySelector<HTMLElement>('.maplibre-basemap-panel')!;
    const radios = Array.from(root.querySelectorAll<HTMLInputElement>('input'));
    control.setActiveBaseMap('dark');
    try {
      expect(root.textContent).toContain('MAPAS Y CAPAS');
      expect(radios).toHaveLength(5);
      expect(radios.map(input => input.disabled)).toEqual([true, false, true, true, true]);
      expect(radios[1].checked).toBe(true);
      for (const index of [0, 2, 3, 4]) radios[index].click();
      expect(change).not.toHaveBeenCalled();
      toggle.click();
      radios[1].dispatchEvent(new Event('change'));
      expect(change).toHaveBeenCalledExactlyOnceWith('satellite');
      expect(panel.inert).toBe(true);
      toggle.click();
      root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(toggle.getAttribute('aria-expanded')).toBe('false');
      const gesture = vi.fn();
      viewport.addEventListener('pointerdown', gesture);
      root.dispatchEvent(new Event('pointerdown', { bubbles: true }));
      expect(gesture).not.toHaveBeenCalled();
      expect(viewport.contains(root)).toBe(true);
    } finally {
      control.onRemove();
      component.map = null;
      viewport.remove();
    }
  });
});
