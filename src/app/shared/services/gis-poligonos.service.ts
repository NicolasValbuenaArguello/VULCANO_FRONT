
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext, HttpErrorResponse } from '@angular/common/http';
import { Observable, catchError, throwError } from 'rxjs';
import {environment} from '../../../environments/environment'
import { GIS_AUTH_DIAGNOSTIC } from '../../core/auth/auth-http-context';


/**
 * Geometría GeoJSON de un polígono.
 * Las posiciones utilizan el orden [longitud, latitud].
 */
export interface GeometriaPoligono {
  type: 'Polygon';
  coordinates: [number, number][][];
}

/** Entrada del componente; registrar adapta geometry al DTO protegido sin modificar sus posiciones. */
export interface PoligonoDemo {
  nombre: string;
  descripcion?: string;
  geometry: GeometriaPoligono;
}

export interface RespuestaPoligonoDemo {
  ok: true;
  mensaje: string;
  registro: {
    id: string;
    nombre: string;
    geometria: GeometriaPoligono;
    area_m2: number;
    perimetro_m: number;
  };
}

@Injectable({
  providedIn: 'root'
})
export class GisPoligonosService {
  private readonly http = inject(HttpClient);

  // Router protegido: el interceptor adjunta el access token de la sesion actual.
  private readonly url = environment.gisPoligonosUrl;

  /**
   * Envía un polígono cartográfico de prueba.
   * No modifica el estado de los mapas.
   */
  registrar(
    poligono: PoligonoDemo
  ): Observable<RespuestaPoligonoDemo> {
    return this.http.post<RespuestaPoligonoDemo>(
      this.url,
      // Adapta solo el DTO: conserva exactamente el anillo GeoJSON del componente.
      { nombre: poligono.nombre, descripcion: poligono.descripcion, geometria: poligono.geometry },
      { context: new HttpContext().set(GIS_AUTH_DIAGNOSTIC, !environment.production) },
    ).pipe(
      catchError((error: HttpErrorResponse) => {
        // El cuerpo y las credenciales se propagan al consumidor, nunca al log.

        return throwError(() => error);
      })
    );
  }
}
