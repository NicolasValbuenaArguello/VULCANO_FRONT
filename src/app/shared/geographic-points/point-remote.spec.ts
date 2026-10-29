import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { Router } from '@angular/router';
import { vi } from 'vitest';
import { appConfig } from '../../app.config';
import { AuthService } from '../../core/auth/auth.service';
import { loginFixture } from '../../core/auth/auth-test.fixture';
import { ApiConfigService } from '../../core/services/api-config.service';
import { GeographicPointsService, DEFAULT_POINT_STYLE } from './geographic-points';
import { PointRemoteService } from './point-remote.service';
import { PointApiService } from './point-api.service';
import { VentanaPuntos } from '../../pages/vulcano/ventana-puntos/ventana-puntos';

const base = '/api/coordenadas/puntos';
const id = '00000000-0000-4000-8000-000000000001';
const input = { nombre: 'Persistido', observaciones: 'Nota', latitud: 4, longitud: -73, ...DEFAULT_POINT_STYLE };
const record = (pointId = id) => ({ ...input, id: pointId, sistema_referencia: 'WGS84',
  fecha_creacion: '2026-10-29T12:00:00Z', fecha_actualizacion: '2026-10-29T12:00:00Z' });
const envelope = (p = record()) => ({ ok: true, mensaje: 'Confirmado', registro: p });

describe('Persistencia remota PUNTOS con JWT y backend simulado', () => {
  let http: HttpTestingController, auth: AuthService, remote: PointRemoteService, state: GeographicPointsService;
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [...appConfig.providers, provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController); auth = TestBed.inject(AuthService);
    remote = TestBed.inject(PointRemoteService); state = TestBed.inject(GeographicPointsService);
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    vi.spyOn(console, 'warn').mockImplementation(() => {}); vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => { http.verify(); vi.restoreAllMocks(); });
  async function signIn(records: ReturnType<typeof record>[] = []) {
    const response = loginFixture();
    const login = firstValueFrom(auth.login('tester', 'password'));
    http.expectOne('/api/auth/token').flush(response); await login;
    TestBed.tick();
    const req = http.expectOne(base);
    expect(req.request.headers.get('Authorization')).toBe(`Bearer ${response.access_token}`);
    req.flush({ ok: true, total: records.length, registros: records }); await Promise.resolve();
    return response;
  }
  it('loads after login without opening the window and preserves remote UUIDs and geometries', async () => {
    TestBed.tick(); http.expectNone(base);
    await signIn([record()]);
    expect(remote.cargado()).toBe(true); expect(state.registros()[0].id).toBe(id);
    expect(state.geometria().features).toHaveLength(2);
    const first = TestBed.createComponent(VentanaPuntos); first.detectChanges();
    expect(first.nativeElement.textContent).toContain('Persistido'); first.destroy();
    const reopened = TestBed.createComponent(VentanaPuntos); reopened.detectChanges();
    http.expectNone(base); expect(state.registros()).toHaveLength(1);
  });
  it('performs POST, individual GET, PUT and DELETE only changing state after confirmation', async () => {
    await signIn();
    const save = remote.guardar(input); const req = http.expectOne(base);
    expect(req.request.method).toBe('POST'); expect(req.request.body.id).toBeUndefined();
    expect(state.registros()).toHaveLength(0); expect(remote.operacion()).toBe('guardando');
    const duplicate = remote.guardar(input); await expect(duplicate).rejects.toThrow('pendiente'); http.expectNone(base);
    req.flush(envelope(), { status: 201, statusText: 'Created' }); await save;
    expect(state.registros()[0].id).toBe(id);
    const query = firstValueFrom(TestBed.inject(PointApiService).consultar(id));
    http.expectOne(`${base}/${id}`).flush(envelope()); expect((await query).id).toBe(id);
    const update = remote.guardar({ ...input, nombre: 'Editado' }, id);
    const put = http.expectOne(`${base}/${id}`); expect(put.request.method).toBe('PUT');
    expect(state.registros()[0].nombre).toBe('Persistido');
    put.flush(envelope({ ...record(), nombre: 'Editado' })); await update;
    expect(state.registros()[0].nombre).toBe('Editado');
    const remove = remote.eliminar(id); const del = http.expectOne(`${base}/${id}`);
    expect(del.request.method).toBe('DELETE'); expect(state.registros()).toHaveLength(1);
    del.flush(envelope()); await remove; expect(state.registros()).toHaveLength(0);
  });
  it.each([403, 404, 409, 422, 500])('preserves confirmed records after rejected DELETE %s', async status => {
    await signIn([record()]);
    const remove = remote.eliminar(id); const rejected = expect(remove).rejects.toThrow();
    http.expectOne(`${base}/${id}`).flush({ detail: 'Error controlado' }, { status, statusText: 'Error' });
    await rejected; expect(state.registros()).toHaveLength(1); expect(remote.error()).toBeTruthy();
  });
  it('conserves a record on a DELETE connection error and clears pending UI state', async () => {
    await signIn([record()]); const remove = remote.eliminar(id);
    const failure = expect(remove).rejects.toThrow('conexión');
    http.expectOne(`${base}/${id}`).error(new ProgressEvent('error')); await failure;
    expect(state.registros()).toHaveLength(1); expect(remote.ocupado()).toBe(false);
  });
  it('reloads after a new login and ignores a prior session response', async () => {
    await signIn([record()]);
    await auth.logout(); TestBed.tick();
    expect(state.registros()).toHaveLength(0);
    await signIn([record()]); expect(state.registros()[0].id).toBe(id);
    const load = remote.cargar(); const old = http.expectOne(base);
    await auth.logout(); old.flush({ ok: true, total: 1, registros: [record()] }); await load;
    expect(state.registros()).toHaveLength(0);
  });
  it('recovers the same UUID after recreating the frontend injector and authenticating again', async () => {
    await signIn([record()]); http.verify();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [...appConfig.providers, provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController); auth = TestBed.inject(AuthService);
    remote = TestBed.inject(PointRemoteService); state = TestBed.inject(GeographicPointsService);
    vi.spyOn(TestBed.inject(Router), 'navigateByUrl').mockResolvedValue(true);
    expect(state.registros()).toHaveLength(0); expect(auth.getToken()).toBeNull();
    TestBed.tick(); http.expectNone(base);
    await signIn([record()]); expect(state.registros()[0].id).toBe(id);
    expect(state.geometria().features).toHaveLength(2);
  });
  it('uses existing 401 logout and discards data of the ended session', async () => {
    await signIn([record()]);
    const remove = remote.eliminar(id); const rejected = expect(remove).rejects.toBeDefined();
    http.expectOne(`${base}/${id}`).flush({ detail: 'Token inválido' }, { status: 401, statusText: 'Unauthorized' });
    await rejected; expect(auth.getToken()).toBeNull(); expect(state.registros()).toHaveLength(0);
  });
  it('does not repeat an ambiguous POST and reconciles a committed record through GET', async () => {
    await signIn();
    const save = remote.guardar(input); const rejected = expect(save).rejects.toThrow();
    http.expectOne(base).error(new ProgressEvent('error')); await rejected;
    expect(state.registros()).toHaveLength(0); expect(remote.creacionPendiente()).toBe(true);
    await expect(remote.guardar(input)).rejects.toThrow('sin confirmar'); http.expectNone(base);
    const recover = remote.comprobarCreacion(); const get = http.expectOne(base);
    expect(get.request.method).toBe('GET'); get.flush({ ok: true, total: 1, registros: [record()] });
    expect((await recover)?.id).toBe(id); expect(state.registros()).toHaveLength(1);
    expect(remote.creacionPendiente()).toBe(false);
  });
  it('retains a blocked creation when reconciliation is empty rather than risking a duplicate', async () => {
    await signIn();
    const save = remote.guardar(input); const rejected = expect(save).rejects.toThrow();
    http.expectOne(base).flush({}, { status: 500, statusText: 'Server Error' }); await rejected;
    const check = remote.comprobarCreacion(); const failure = expect(check).rejects.toThrow('No se puede confirmar');
    http.expectOne(base).flush({ ok: true, total: 0, registros: [] }); await failure;
    expect(remote.creacionPendiente()).toBe(true);
  });
  it('preserves the draft on validation error, then cleans it only after a confirmed manual retry', async () => {
    await signIn(); const fixture = TestBed.createComponent(VentanaPuntos); fixture.detectChanges();
    const form = fixture.componentInstance; form.nombre = input.nombre; form.observaciones = input.observaciones;
    form.latitud = input.latitud; form.longitud = input.longitud;
    const failed = form.agregar(); http.expectOne(base).flush({ detail: [] }, { status: 422, statusText: 'Unprocessable Entity' }); await failed;
    expect(form.nombre).toBe(input.nombre); expect(state.registros()).toHaveLength(0);
    const success = form.agregar(); http.expectOne(base).flush(envelope()); await success;
    expect(form.nombre).toBe(''); expect(form.mensaje).toContain('CONFIRMADO');
  });
  it('rejects malformed load responses and permits a manual reload without erasing prior data', async () => {
    await signIn([record()]); const load = remote.cargar();
    http.expectOne(base).flush({ ok: true, total: 2, registros: [] }); await load;
    expect(state.registros()).toHaveLength(1); expect(remote.error()).toBeTruthy();
    const retry = remote.cargar(); http.expectOne(base).flush({ ok: true, total: 1, registros: [record()] }); await retry;
    expect(remote.error()).toBeNull();
  });
  it('authorizes only this same-origin prefix, preserving other credential boundaries', () => {
    const config = TestBed.inject(ApiConfigService);
    expect(config.isBackendUrl(base)).toBe(true); expect(config.isBackendUrl(`${base}/${id}`)).toBe(true);
    for (const url of ['https://untrusted.example' + base, base + '-externo', '/api/coordenadas/registrar']) expect(config.isBackendUrl(url)).toBe(false);
  });
});
