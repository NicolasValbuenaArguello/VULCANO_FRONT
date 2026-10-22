import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { catchError, Observable, throwError } from 'rxjs';
import { environment } from './environment';
import { PointInput, PointRecord } from './point.model';

export class PointsError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

@Injectable({ providedIn: 'root' })
export class PointsService {
  private readonly http = inject(HttpClient);
  private readonly base = environment.api.demoPoints.replace(/\/+$/, '');

  list(): Observable<PointRecord[]> { return this.handle(this.http.get<PointRecord[]>(this.base)); }
  create(value: PointInput): Observable<PointRecord> { return this.handle(this.http.post<PointRecord>(this.base, value)); }
  update(id: string, value: PointInput): Observable<PointRecord> {
    return this.handle(this.http.put<PointRecord>(`${this.base}/${encodeURIComponent(id)}`, value));
  }
  delete(id: string): Observable<void> {
    return this.handle(this.http.delete<void>(`${this.base}/${encodeURIComponent(id)}`));
  }

  private handle<T>(request: Observable<T>): Observable<T> {
    return request.pipe(catchError((error: HttpErrorResponse) => {
      const messages: Record<number, string> = {
        0: 'No se pudo conectar con el servicio demostrativo.',
        400: 'El registro no es válido.',
        404: 'El punto ya no existe. Actualiza el listado.',
        422: 'Revisa los campos del formulario.',
        500: 'El servidor no pudo completar la operación.',
      };
      let message = messages[error.status] ?? 'No se pudo completar la operación.';
      const detail = error.error?.detail;
      if (error.status < 500 && typeof detail === 'string') message = detail;
      if (error.status === 422 && Array.isArray(detail)) {
        message = detail.map(item => `${Array.isArray(item.loc) ? item.loc.filter((part: unknown) => part !== 'body').join('.') : 'Campo'}: ${typeof item.msg === 'string' ? item.msg : 'valor no válido'}`).join('; ') || message;
      }
      return throwError(() => new PointsError(error.status, message));
    }));
  }
}
