
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

// Ajusta la ruta a la ubicación real de shared-environment.ts.
import { sharedEnvironment } from '../../../environments/environment.shared';

export interface CurvaNivelFeature {
  type: 'Feature';
  properties: {
    elevacion: number;
    principal: boolean;
  };
  geometry: {
    type: 'LineString' | 'MultiLineString';
    coordinates: number[][] | number[][][];
  };
}

export interface CurvasNivelResponse {
  type: 'FeatureCollection';
  features: CurvaNivelFeature[];
}

export interface CurvasNivelBBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

@Injectable({
  providedIn: 'root'
})
export class CurvasNivelService {

  private readonly http = inject(HttpClient);

  consultarBBox(
    bbox: CurvasNivelBBox,
    intervalo: 50 | 100 | 200 | 500 = 50,
    simplify = 5
  ): Observable<CurvasNivelResponse> {

    const params = new HttpParams()
      .set('west', bbox.west)
      .set('south', bbox.south)
      .set('east', bbox.east)
      .set('north', bbox.north)
      .set('intervalo', intervalo)
      .set('simplify', simplify);

    return this.http.get<CurvasNivelResponse>(
      sharedEnvironment.endpoints.curvasBBox,
      { params }
    );
  }
}
