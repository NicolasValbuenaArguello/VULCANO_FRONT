import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { HttpTestingController } from '@angular/common/http/testing';
import { vi } from 'vitest';
import { TerrainElevationService } from './terrain-elevation.service';
import { TestBed } from '@angular/core/testing';
import { MeasurementToolsComponent } from './measurement-tools.component';
import { MeasurementService } from './measurement.service';
import { nationalCoordinates, horizontalDistance, geographicAngle } from './geographic-math';

describe('Geographic measurement tools', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] }));
  afterEach(() => { TestBed.inject(HttpTestingController).verify({ ignoreCancelled: true }); vi.useRealTimers(); });

  it('keeps route segments, supports undo and only finishes on explicit action', () => {
    const state = TestBed.inject(MeasurementService);
    state.start('route');
    state.addPoint({ latitud: 0, longitud: 0 });
    state.addPoint({ latitud: 0, longitud: .01 });
    state.addPoint({ latitud: .01, longitud: .01 });
    expect(state.measurements()).toHaveLength(0);
    state.undo();
    expect(state.draft()).toHaveLength(2);
    state.addPoint({ latitud: .01, longitud: .01 });
    state.finishRoute();
    expect(state.measurements()[0].segments).toHaveLength(2);
    expect(state.measurements()[0].horizontal).toBeCloseTo(2223.8985, 3);
    expect(state.draft()).toHaveLength(0);
    TestBed.inject(HttpTestingController).expectNone(() => true);
  });

  it('builds terrain profiles only from complete real samples, with measured extrema and height difference', () => {
    const state = TestBed.inject(MeasurementService);
    const http = TestBed.inject(HttpTestingController);
    state.start('profile');
    state.addPoint({ latitud: 4, longitud: -74 });
    state.addPoint({ latitud: 4.001, longitud: -74 });
    const requests = http.match(request => request.url.includes('/dem/elevacion'));
    expect(requests).toHaveLength(3);
    requests.forEach((request, index) => request.flush({ elevacion: [100, 130, 110][index], fuente: 'DEM de prueba', datum_vertical: 'MSNM' }));
    const result = state.measurements()[0];
    expect(result.loading).toBe(false);
    expect(result.minimum).toBe(100);
    expect(result.maximum).toBe(130);
    expect(result.heightDifference).toBe(10);
    expect(result.relief!).toBeGreaterThan(result.horizontal);
    expect(result.chart).not.toBe('');
    expect(result.samples).toHaveLength(3);
  });

  it('limits the total HTTP concurrency and cancels incomplete profiles without invented graphs', () => {
    const state = TestBed.inject(MeasurementService);
    const http = TestBed.inject(HttpTestingController);
    for (const lat of [4, 5]) {
      state.start('profile');
      state.addPoint({ latitud: lat, longitud: -74 });
      state.addPoint({ latitud: lat + .1, longitud: -74 });
    }
    const requests = http.match(request => request.url.includes('/dem/elevacion'));
    expect(requests).toHaveLength(4);
    state.clear();
    expect(requests.every(request => request.cancelled)).toBe(true);
    expect(state.measurements()).toHaveLength(0);
    http.expectNone(() => true);
    state.start('profile');
    state.addPoint({ latitud: 6, longitud: -74 });
    state.addPoint({ latitud: 6.001, longitud: -74 });
    http.match(request => request.url.includes('/dem/elevacion')).forEach(request => request.flush({ elevacion: null }));
    expect(state.measurements()[0].chart).toBe('');
    expect(state.measurements()[0].relief).toBeNull();
    expect(state.measurements()[0].message).toContain('Elevación no disponible');
  });

  it('debounces cursor lookups, cancels old requests and caches real elevations including zero', () => {
    vi.useFakeTimers();
    const state = TestBed.inject(MeasurementService);
    const http = TestBed.inject(HttpTestingController);
    for (let i = 0; i < 100; i++) state.updateCursor({ latitud: 4 + i / 10000, longitud: -74 });
    http.expectNone(() => true);
    vi.advanceTimersByTime(450);
    const old = http.expectOne(request => request.url.includes('/dem/elevacion'));
    state.updateCursor({ latitud: 5, longitud: -74 });
    expect(old.cancelled).toBe(true);
    vi.advanceTimersByTime(450);
    http.expectOne(request => request.params.keys().length === 0 && request.url.includes('lat=5&lon=-74'))
      .flush({ elevacion: 0, fuente: 'DEM de prueba', datum_vertical: 'MSNM' });
    expect(state.cursor()?.elevation?.metres).toBe(0);
    state.updateCursor({ latitud: 5, longitud: -74 });
    vi.advanceTimersByTime(450);
    http.expectNone(() => true);
    expect(state.cursor()?.elevation?.source).toBe('DEM de prueba');
    state.updateCursor(null);
    expect(state.cursor()).toBeNull();
  });

  it('never interprets missing DEM as zero and queries an explicit elevation only on click', () => {
    const state = TestBed.inject(MeasurementService);
    const http = TestBed.inject(HttpTestingController);
    state.start('elevation');
    http.expectNone(() => true);
    state.addPoint({ latitud: 4, longitud: -74 });
    expect(state.measurements()[0].loading).toBe(true);
    http.expectOne(request => request.url.includes('/dem/elevacion')).flush({ elevacion: null });
    expect(state.measurements()[0].samples[0].metres).toBeNull();
    expect(state.measurements()[0].message).toBe('Elevación no disponible');
    let height: number | null = 10;
    TestBed.inject(TerrainElevationService).get({ latitud: 4, longitud: -74 }).subscribe(value => height = value.metres);
    expect(height).toBeNull();
    http.expectNone(() => true);
  });
  it('measures angles in a local metric projection and rejects undefined vertices', () => {
    const vertex = { latitud: 0, longitud: 0 };
    expect(geographicAngle({ latitud: .01, longitud: 0 }, vertex, { latitud: 0, longitud: .01 })).toBeCloseTo(90, 8);
    expect(geographicAngle({ latitud: .01, longitud: 0 }, vertex, { latitud: -.01, longitud: 0 })).toBeCloseTo(180, 8);
    expect(geographicAngle(vertex, vertex, { latitud: 0, longitud: .01 })).toBeNull();
    const state = TestBed.inject(MeasurementService);
    state.start('angle');
    for (const point of [{ latitud: .01, longitud: 0 }, vertex, { latitud: 0, longitud: .01 }]) state.addPoint(point);
    expect(state.measurements()[0].angle).toBeCloseTo(90, 8);
  });
  it('measures known spherical distances, keeps completed geometry and supports repeated measurements', () => {
    const state = TestBed.inject(MeasurementService);
    expect(horizontalDistance({ latitud: 0, longitud: 0 }, { latitud: 0, longitud: 1 })).toBeCloseTo(111194.9266, 3);
    expect(horizontalDistance({ latitud: 0, longitud: 179.9 }, { latitud: 0, longitud: -179.9 })).toBeCloseTo(22238.9853, 3);
    state.start('distance');
    state.addPoint({ latitud: 4, longitud: -74 });
    state.addPoint({ latitud: 4.01, longitud: -74 });
    expect(state.measurements()).toHaveLength(1);
    expect(state.measurements()[0].horizontal).toBeGreaterThan(1100);
    expect(state.draft()).toHaveLength(0);
    state.addPoint({ latitud: 4, longitud: -74 });
    state.cancel();
    expect(state.measurements()).toHaveLength(1);
    state.clear();
    expect(state.measurements()).toHaveLength(0);
  });
  it('shows decimal, DMS and the same national metric reference without an active tool', () => {
    const fixture = TestBed.createComponent(MeasurementToolsComponent);
    fixture.detectChanges();
    const state = TestBed.inject(MeasurementService);
    state.updateCursor({ latitud: 4, longitud: -73 });
    fixture.detectChanges();
    expect(state.tool()).toBeNull();
    expect(nationalCoordinates(-73, 4)).toEqual({ x: 5000000, y: 2000000 });
    expect(fixture.nativeElement.textContent).toContain('LAT: 4.000000');
    expect(fixture.nativeElement.textContent).toContain('EPSG:9377');
    expect(fixture.componentInstance.dms(-74.5, false)).toContain('74° 30′ 0.00″ W');
    state.updateCursor(null);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Coordenadas no disponibles');
  });
  it('offers the same tools and shared state without touching stored map data', () => {
    const first = TestBed.createComponent(MeasurementToolsComponent);
    const second = TestBed.createComponent(MeasurementToolsComponent);
    first.detectChanges();
    second.detectChanges();
    first.nativeElement.querySelector('button').click();
    first.detectChanges();
    expect(first.nativeElement.textContent).toContain('PERFIL DEL TERRENO');
    expect(first.nativeElement.querySelectorAll('.geo-tools-panel > button')).toHaveLength(6);
    first.nativeElement.querySelector('.geo-tools-panel button').click();
    expect(TestBed.inject(MeasurementService).tool()).toBe('distance');
    expect(second.componentInstance.state).toBe(first.componentInstance.state);
  });
});
