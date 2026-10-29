import { HttpClient, HttpContext, HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, throwError, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { SKIP_AUTH_INTERCEPTOR, SKIP_ERROR_INTERCEPTOR } from '../../core/auth/auth-http-context';
import { PoligonoEntrada, PoligonoRegistro } from './poligono.model';

/** HTTP del servicio GIS local independiente: no envia credenciales del backend principal. */
@Injectable({ providedIn: 'root' })
export class PoligonosGisService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.gisPoligonosUrl;
  private readonly context = new HttpContext()
    .set(SKIP_AUTH_INTERCEPTOR, true)
    .set(SKIP_ERROR_INTERCEPTOR, true);
  /** @returns Lista persistida; no usa catalogos ni registros de coordenadas operacionales. */
  obtenerPoligonos(): Observable<PoligonoRegistro[]> {
    return this.procesar(this.http.get<PoligonoRegistro[]>(this.base, { context: this.context }));
  }
  /** @param id UUID a consultar. @returns Registro y version usada para control optimista. */
  obtenerPoligono(id: string): Observable<PoligonoRegistro> {
    return this.procesar(this.http.get<PoligonoRegistro>(this.url(id), { context: this.context }));
  }
  /** @param entrada Datos validados del editor. @returns Registro confirmado por el servidor, con UUID/fechas. */
  crearPoligono(entrada: PoligonoEntrada): Observable<PoligonoRegistro> {
    return this.procesar(
      this.http.post<PoligonoRegistro>(this.base, entrada, { context: this.context }),
    );
  }
  /** @param registro Version previamente consultada. @param entrada Reemplazo completo de atributos y geometria. */
  actualizarPoligono(
    registro: PoligonoRegistro,
    entrada: PoligonoEntrada,
  ): Observable<PoligonoRegistro> {
    return this.procesar(
      this.http.put<PoligonoRegistro>(this.url(registro.id), entrada, {
        context: this.context,
        headers: { 'If-Match': `"${registro.version}"` },
      }),
    );
  }
  /** @param registro Registro/version a eliminar; un conflicto 409 conserva el borrador y exige recarga. */
  eliminarPoligono(registro: PoligonoRegistro): Observable<void> {
    return this.procesar(
      this.http.delete<void>(this.url(registro.id), {
        context: this.context,
        headers: { 'If-Match': `"${registro.version}"` },
      }),
    );
  }
  /** Escapa el identificador para impedir que se interprete como ruta adicional. */
  private url(id: string): string {
    return `${this.base}/${encodeURIComponent(id)}`;
  }
  /** Aplica timeout y mensajes controlados; no presenta cuerpos arbitrarios del servidor. */
  private procesar<T>(peticion: Observable<T>): Observable<T> {
    return peticion.pipe(
      timeout(environment.timeout),
      catchError((error: unknown) => {
        const status = error instanceof HttpErrorResponse ? error.status : 0;
        const mensajes: Record<number, string> = {
          409: 'El registro cambio. Actualiza la lista y vuelve a cargarlo antes de guardar.',
          404: 'El poligono ya no existe.',
          422: 'El servidor rechazo los datos o la geometria.',
          401: 'El servicio GIS requiere autenticacion.',
          403: 'El servicio GIS denego la operacion.',
        };
        return throwError(
          () =>
            new Error(mensajes[status] ?? 'No se pudo completar la operacion con el servicio GIS.'),
        );
      }),
    );
  }
}
