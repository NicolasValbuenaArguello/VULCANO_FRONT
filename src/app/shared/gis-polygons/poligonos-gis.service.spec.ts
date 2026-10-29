import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { PoligonosGisService } from './poligonos-gis.service';
import { SKIP_AUTH_INTERCEPTOR } from '../../core/auth/auth-http-context';
import { PoligonoEntrada, PoligonoRegistro } from './poligono.model';

const entrada: PoligonoEntrada = {
  nombre: 'Prueba',
  descripcion: '',
  vertices: [
    { latitud: 0, longitud: 0 },
    { latitud: 0, longitud: 1 },
    { latitud: 1, longitud: 0 },
  ],
  geometria: {
    type: 'Polygon',
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [0, 1],
        [0, 0],
      ],
    ],
  },
  srid: 4326,
  estilo: {
    colorRelleno: '#3498db',
    colorLinea: '#ffffff',
    opacidadRelleno: 0.65,
    opacidadLinea: 1,
    grosorLinea: 2.5,
  },
};
const registro: PoligonoRegistro = {
  ...entrada,
  id: 'ejemplo',
  version: 2,
  fecha_creacion: 'fecha',
  fecha_actualizacion: 'fecha',
};
describe('HTTP GIS independiente', () => {
  let api: PoligonosGisService, http: HttpTestingController;
  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(PoligonosGisService);
    http = TestBed.inject(HttpTestingController);
  });
  afterEach(() => http.verify());
  it('creates, lists and queries without credentials from the main backend', async () => {
    let result = firstValueFrom(api.crearPoligono(entrada));
    let req = http.expectOne('/api/gis/poligonos');
    expect(req.request.context.get(SKIP_AUTH_INTERCEPTOR)).toBe(true);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush(registro);
    expect(await result).toEqual(registro);
    const lista = firstValueFrom(api.obtenerPoligonos());
    http.expectOne('/api/gis/poligonos').flush([registro]);
    expect(await lista).toHaveLength(1);
    result = firstValueFrom(api.obtenerPoligono('ejemplo'));
    http.expectOne('/api/gis/poligonos/ejemplo').flush(registro);
    expect(await result).toEqual(registro);
  });
  it('sends the current version for update and delete', async () => {
    const result = firstValueFrom(api.actualizarPoligono(registro, entrada));
    let req = http.expectOne('/api/gis/poligonos/ejemplo');
    expect(req.request.method).toBe('PUT');
    expect(req.request.headers.get('If-Match')).toBe('"2"');
    req.flush({ ...registro, version: 3 });
    await result;
    const borrado = firstValueFrom(api.eliminarPoligono(registro));
    req = http.expectOne('/api/gis/poligonos/ejemplo');
    expect(req.request.method).toBe('DELETE');
    expect(req.request.headers.get('If-Match')).toBe('"2"');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await borrado;
  });
  it.each([0, 401, 403, 404, 409, 422, 500])(
    'handles HTTP status %s without exposing server details',
    async (status) => {
      const result = firstValueFrom(api.obtenerPoligonos());
      const rechazo = expect(result).rejects.not.toThrow('private-detail');
      const req = http.expectOne('/api/gis/poligonos');
      if (status === 0) req.error(new ProgressEvent('error'));
      else req.flush({ detail: 'private-detail' }, { status, statusText: 'Error' });
      await rechazo;
    },
  );
});
