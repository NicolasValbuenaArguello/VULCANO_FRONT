import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import * as L from 'leaflet';
import { vi } from 'vitest';
import { MapaComponent } from '../mapa/mapa';
import { MapaTresD } from '../../../pages/vulcano/mapa-tres-d/mapa-tres-d';

describe('Map layers controls', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }));

  it('keeps all five native Leaflet selections, toggles and isolates map gestures', () => {
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
      for (const [index, key] of ['streets', 'satellite', 'topographic', 'light', 'dark'].entries()) {
        control.expand();
        radios[index].click();
        expect(component.activeBaseMapKey).toBe(key);
        expect(map.hasLayer(component.baseLayers[key])).toBe(true);
        expect(Object.values(component.baseLayers).filter(layer => map.hasLayer(layer as L.Layer))).toHaveLength(1);
      }
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

  it('keeps all five MapLibre callbacks, selected state and closes without map gestures', () => {
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
      for (const [index, key] of ['streets', 'satellite', 'topographic', 'light', 'dark'].entries()) {
        toggle.click();
        expect(toggle.getAttribute('aria-expanded')).toBe('true');
        expect(panel.inert).toBe(false);
        radios[index].click();
        expect(change).toHaveBeenLastCalledWith(key);
        control.setActiveBaseMap(key);
        expect(radios[index].checked).toBe(true);
        expect(toggle.getAttribute('aria-expanded')).toBe('false');
        expect(panel.inert).toBe(true);
      }
      expect(change).toHaveBeenCalledTimes(5);
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
