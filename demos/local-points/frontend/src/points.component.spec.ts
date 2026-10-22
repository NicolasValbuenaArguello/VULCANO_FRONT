import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PointsComponent } from './points.component';
import { PointRecord } from './point.model';
import { environment } from './environment';

describe('Demo form and list', () => {
  let fixture: ComponentFixture<PointsComponent>;
  let component: PointsComponent;
  let http: HttpTestingController;
  const base = environment.api.demoPoints;
  const record: PointRecord = { id: 'demo-1', name: 'Ejemplo', x: 0, y: -8, description: 'Local', created_at: '2026-01-01T00:00:00Z' };

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [PointsComponent], providers: [provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
    fixture = TestBed.createComponent(PointsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    http.expectOne(base).flush([]);
    await fixture.whenStable();
  });
  afterEach(() => http.verify());

  it('rejects missing fields without sending HTTP', () => {
    component.save();
    expect(component.form.invalid).toBe(true);
    expect(component.form.controls.name.touched).toBe(true);
    http.expectNone(base);
  });

  it('sends one request for repeated submit and displays the persisted record', async () => {
    component.form.setValue({ name: record.name, x: 0, y: -8, description: record.description });
    component.save(); component.save();
    expect(component.busy()).toBe(true);
    const request = http.expectOne(base);
    request.flush(record, { status: 201, statusText: 'Created' });
    await fixture.whenStable();
    expect(component.busy()).toBe(false);
    expect(component.points()).toEqual([record]);
    expect(fixture.nativeElement.querySelector('li').textContent).toContain(record.id);
    expect(component.success()).toBe('Punto creado.');
    expect(component.form.controls.name.value).toBe('');
  });

  it('retains input after a validation failure and permits correction', () => {
    component.form.setValue({ name: record.name, x: 0, y: -8, description: record.description });
    component.save();
    http.expectOne(base).flush({ detail: [{ loc: ['body', 'name'], msg: 'Nombre no válido' }] }, { status: 422, statusText: 'Validation' });
    expect(component.form.controls.name.value).toBe(record.name);
    expect(component.error()).toContain('Nombre no válido');
    expect(component.success()).toBe('');
    expect(component.busy()).toBe(false);
    component.form.controls.name.setValue('Corregido');
    component.save();
    http.expectOne(base).flush({ ...record, name: 'Corregido' });
    expect(component.error()).toBe('');
    expect(component.success()).toBe('Punto creado.');
  });

  it('edits and deletes once without creating a duplicate or reloading unnecessarily', () => {
    component.points.set([record]);
    component.edit(record);
    component.form.controls.x.setValue(35);
    component.save();
    const request = http.expectOne(`${base}/${record.id}`);
    expect(request.request.method).toBe('PUT');
    request.flush({ ...record, x: 35 });
    expect(component.points()).toHaveLength(1);
    expect(component.points()[0].x).toBe(35);
    component.deleting.set(component.points()[0]);
    component.confirmDelete(); component.confirmDelete();
    const deletion = http.expectOne(`${base}/${record.id}`);
    expect(deletion.request.method).toBe('DELETE');
    deletion.flush(null, { status: 204, statusText: 'No Content' });
    expect(component.points()).toEqual([]);
    expect(component.success()).toBe('Punto eliminado.');
    http.expectNone(base);
  });
});
