import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PuntosDemoService } from './puntos-demo.service';
import { environment } from '../../../environments/environment';
import { PuntoDemo } from '../models/punto-demo.model';

describe('Persisted demonstration state', () => {
  let service: PuntosDemoService;
  let http: HttpTestingController;
  const url = environment.endpoints.demoListar;
  const record: PuntoDemo = { id: 'fictional', name: 'Local', category: 'punto', x: 12, y: -7, created_at: '2026-09-30T00:00:00Z' };
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(PuntosDemoService); http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('starts empty and shares one in-flight and cached query', () => {
    expect(service.registros()).toEqual([]);
    service.cargar().subscribe(); service.cargar().subscribe();
    http.expectOne(url).flush([]);
    service.cargar().subscribe(); http.expectNone(url);
    expect(service.listo()).toBe(true);
  });
  it('registers, updates and deletes confirmed records without duplicate IDs', () => {
    service.crear(record).subscribe(); http.expectOne({ method: 'POST', url }).flush(record);
    service.actualizar(record.id, { ...record, x: 50 }).subscribe();
    const req = http.expectOne({ method: 'PUT', url: url + '/fictional' });
    expect(req.request.body.x).toBe(50); req.flush({ ...record, x: 50 });
    expect(service.registros()).toHaveLength(1); expect(service.registros()[0].x).toBe(50);
    service.eliminar(record.id).subscribe(); http.expectOne({ method: 'DELETE', url: url + '/fictional' }).flush(null);
    expect(service.registros()).toEqual([]);
  });
  it('deduplicates IDs received during explicit refresh', () => {
    service.cargar().subscribe(); http.expectOne(url).flush([record, { ...record, x: 90 }]);
    expect(service.registros()).toHaveLength(1); expect(service.registros()[0].x).toBe(90);
  });
  for (const status of [0, 400, 404, 422, 500]) {
    it('reports HTTP ' + status + ' without inserting or retrying', () => {
      let message = '';
      service.crear(record).subscribe({ error: error => message = error.message });
      http.expectOne(url).flush({}, { status, statusText: 'Failure' });
      expect(message).toBeTruthy(); expect(service.error()).toBe(message);
      expect(service.registros()).toEqual([]); expect(service.guardando()).toBe(false); http.expectNone(url);
    });
  }
  it('blocks concurrent writes while allowing a shared request to finish', () => {
    const request = service.crear(record); request.subscribe(); request.subscribe();
    service.crear(record).subscribe({ error: error => expect(error).toBeTruthy() });
    http.expectOne(url).flush(record); expect(service.registros()).toHaveLength(1);
  });
  it('rejects malformed responses atomically and preserves the last valid snapshot', () => {
    service.cargar().subscribe(); http.expectOne(url).flush([record]);
    const previous = service.registros();
    for (const response of [{ records: [] }, [null], [{ ...record, x: null }], [{ ...record, x: '12' }],
      [{ ...record, y: NaN }], [{ ...record, y: Infinity }], [{ ...record, id: '' }],
      [{ ...record, category: 'unknown' }], [{ ...record, created_at: '' }]]) {
      service.cargar(true).subscribe({ error: error => expect(error.message).toContain('inválid') });
      http.expectOne(url).flush(response);
      expect(service.registros()).toBe(previous); expect(service.cargando()).toBe(false);
      expect(service.error()).toContain('inválid'); http.expectNone(url);
    }
  });
  it('rejects invalid input before HTTP and releases the loading flag', () => {
    for (const x of [null, undefined, NaN, Infinity, '', '12']) {
      service.crear({ ...record, x: x as number }).subscribe({ error: error => expect(error.message).toContain('inválido') });
      http.expectNone(url); expect(service.guardando()).toBe(false); expect(service.registros()).toEqual([]);
    }
    service.crear(record).subscribe();
    const req = http.expectOne(url);
    expect(req.request.body).toEqual({ name: 'Local', category: 'punto', x: 12, y: -7, description: '' });
    req.flush(record);
  });
  it('does not publish a malformed write response', () => {
    service.crear(record).subscribe({ error: error => expect(error.message).toContain('inválido') });
    http.expectOne(url).flush({ ...record, y: null });
    expect(service.registros()).toEqual([]); expect(service.guardando()).toBe(false);
  });
  it('allows an explicit retry after a failed shared load without automatic retries', () => {
    service.cargar().subscribe({ error: () => {} }); service.cargar().subscribe({ error: () => {} });
    http.expectOne(url).flush({}, { status: 500, statusText: 'Failure' }); http.expectNone(url);
    service.cargar(true).subscribe(); http.expectOne(url).flush([]);
    expect(service.error()).toBe(''); expect(service.listo()).toBe(true);
  });
});
