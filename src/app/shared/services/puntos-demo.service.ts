import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable, signal } from '@angular/core';
import { catchError, defer, finalize, map, Observable, of, shareReplay, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { PuntoDemo, PuntoDemoInput } from '../models/punto-demo.model';

@Injectable({ providedIn: 'root' })
export class PuntosDemoService {
  private readonly http = inject(HttpClient);
  private readonly state = signal<readonly PuntoDemo[]>([]);
  readonly registros = this.state.asReadonly();
  readonly cargando = signal(false);
  readonly guardando = signal(false);
  readonly error = signal('');
  readonly listo = signal(false);
  private carga?: Observable<readonly PuntoDemo[]>;

  cargar(force = false): Observable<readonly PuntoDemo[]> {
    if (this.carga) return this.carga;
    if (this.guardando() || (this.listo() && !force)) return of(this.registros());
    this.carga = defer(() => {
      this.cargando.set(true);
      this.error.set('');
      return this.http.get<unknown>(environment.endpoints.demoListar);
    }).pipe(
      map(value => {
        if (!Array.isArray(value)) throw new Error('Respuesta demostrativa inválida: se esperaba una lista de registros.');
        value.forEach(item => this.validarRegistro(item));
        return Object.freeze([...new Map(value.map(item => [item.id, Object.freeze({ ...item })])).values()]) as readonly PuntoDemo[];
      }),
      tap(registros => {
        this.state.set(registros);
        this.listo.set(true);
      }),
      catchError(error => this.fail(error)),
      finalize(() => { this.cargando.set(false); this.carga = undefined; }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    return this.carga;
  }

  crear(value: PuntoDemoInput): Observable<PuntoDemo> {
    return this.mutate(() => this.http.post<PuntoDemo>(environment.endpoints.demoRegistrar, this.validarEntrada(value)), record => this.upsert(record));
  }

  actualizar(id: string, value: PuntoDemoInput): Observable<PuntoDemo> {
    return this.mutate(() => this.http.put<PuntoDemo>(this.url(id), this.validarEntrada(value)), record => this.upsert(record));
  }

  eliminar(id: string): Observable<void> {
    return this.mutate(() => this.http.delete<void>(this.url(id)), () => {
      this.state.update(records => Object.freeze(records.filter(item => item.id !== id)));
    });
  }

  private url(id: string): string {
    if (typeof id !== 'string' || !id.trim()) throw new Error('El registro demostrativo requiere un ID.');
    return `${environment.endpoints.demoListar.replace(/\/+$/, '')}/${encodeURIComponent(id)}`;
  }

  private upsert(record: PuntoDemo): void {
    this.validarRegistro(record);
    const value = Object.freeze({ ...record });
    this.state.update(records => Object.freeze(records.some(item => item.id === value.id)
      ? records.map(item => item.id === value.id ? value : item) : [...records, value]));
  }

  private mutate<T>(request: () => Observable<T>, apply: (value: T) => void): Observable<T> {
    return defer(() => {
      if (this.cargando() || this.guardando()) return throwError(() => new Error('Espera a que termine la operación actual.'));
      this.guardando.set(true);
      this.error.set('');
      return defer(request).pipe(tap(apply), catchError(error => this.fail(error)), finalize(() => this.guardando.set(false)));
    }).pipe(shareReplay({ bufferSize: 1, refCount: false }));
  }

  private validarEntrada(value: PuntoDemoInput): PuntoDemoInput {
    if (!value || typeof value.name !== 'string' || !value.name.trim() || value.name.trim().length > 100 ||
      !['punto', 'muestra', 'referencia'].includes(value.category) ||
      typeof value.x !== 'number' || !Number.isFinite(value.x) || typeof value.y !== 'number' || !Number.isFinite(value.y) ||
      (value.description !== undefined && (typeof value.description !== 'string' || value.description.length > 1000))) {
      throw new Error('Registro demostrativo inválido: revisa nombre, categoría y coordenadas X/Y finitas.');
    }
    return { name: value.name.trim(), category: value.category, x: value.x, y: value.y, description: value.description ?? '' };
  }

  private validarRegistro(value: unknown): asserts value is PuntoDemo {
    const record = value as PuntoDemo | null;
    if (!record || typeof record.id !== 'string' || !record.id.trim() ||
      typeof record.created_at !== 'string' || !Number.isFinite(Date.parse(record.created_at))) {
      throw new Error('Respuesta demostrativa inválida: faltan un ID o una fecha de creación válidos.');
    }
    this.validarEntrada(record);
  }

  private fail(error: unknown): Observable<never> {
    if (!(error instanceof HttpErrorResponse)) {
      const message = error instanceof Error ? error.message : 'Respuesta demostrativa inválida.';
      this.error.set(message);
      return throwError(() => new Error(message));
    }
    const defaults: Record<number, string> = {
      0: 'No se pudo conectar con el servicio demostrativo.',
      400: 'El registro demostrativo no es válido.',
      404: 'El registro ya no existe. Actualiza el listado.',
      422: 'Revisa nombre, categoría y coordenadas X/Y.',
      500: 'No se pudo guardar o consultar el archivo demostrativo.',
    };
    const detail = error.error?.detail;
    const message = error.status < 500 && typeof detail === 'string'
      ? detail : defaults[error.status] ?? 'No se pudo completar la operación demostrativa.';
    this.error.set(message);
    return throwError(() => new Error(message));
  }
}
