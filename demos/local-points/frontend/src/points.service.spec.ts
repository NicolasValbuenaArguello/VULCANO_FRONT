import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PointsError, PointsService } from './points.service';
import { PointInput, PointRecord } from './point.model';
import { environment } from './environment';

describe('PointsService HTTP contract', () => {
  let service: PointsService;
  let http: HttpTestingController;
  const base = environment.api.demoPoints;
  const value: PointInput = { name: 'Ejemplo', x: 12.5, y: -7, description: 'Punto ficticio' };
  const record: PointRecord = { ...value, id: 'demo-1', created_at: '2026-01-01T00:00:00Z' };

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(PointsService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());

  it('creates a record by POST using the JSON contract', () => {
    let received: PointRecord | undefined;
    service.create(value).subscribe(point => received = point);
    const request = http.expectOne(base);
    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual(value);
    expect(request.request.detectContentTypeHeader()).toBe('application/json');
    request.flush(record, { status: 201, statusText: 'Created' });
    expect(received).toEqual(record);
  });

  it('lists records by GET', () => {
    let received: PointRecord[] = [];
    service.list().subscribe(points => received = points);
    const request = http.expectOne(base);
    expect(request.request.method).toBe('GET');
    request.flush([record]);
    expect(received).toEqual([record]);
  });

  it('updates by PUT and returns the server response', () => {
    const updated = { ...record, name: 'Actualizado' };
    let received: PointRecord | undefined;
    service.update(record.id, { ...value, name: updated.name }).subscribe(point => received = point);
    const request = http.expectOne(`${base}/${record.id}`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.body.name).toBe(updated.name);
    request.flush(updated);
    expect(received).toEqual(updated);
  });

  it('deletes by DELETE and accepts 204', () => {
    let completed = false;
    service.delete(record.id).subscribe({ complete: () => completed = true });
    const request = http.expectOne(`${base}/${record.id}`);
    expect(request.request.method).toBe('DELETE');
    request.flush(null, { status: 204, statusText: 'No Content' });
    expect(completed).toBe(true);
  });

  for (const status of [400, 404, 422, 500]) {
    it(`exposes HTTP ${status} without automatic retry`, () => {
      let received: PointsError | undefined;
      service.create(value).subscribe({ error: error => received = error });
      const detail = status === 422 ? [{ loc: ['body', 'x'], msg: 'Input should be a valid number' }] : 'Mensaje del servidor';
      http.expectOne(base).flush({ detail }, { status, statusText: 'Error' });
      expect(received).toBeInstanceOf(PointsError);
      expect(received?.status).toBe(status);
      expect(received?.message).toBe(status === 422 ? 'x: Input should be a valid number' : status === 500 ? 'El servidor no pudo completar la operación.' : 'Mensaje del servidor');
      http.expectNone(base);
    });
  }
});
