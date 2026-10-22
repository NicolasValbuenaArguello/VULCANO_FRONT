import { HttpClient, HttpContext, HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom, timeout } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ApiConfigService } from './api-config.service';
import { LOADER_OPERATION } from '../interceptors/loader.interceptor';

export interface CoordenadasRegistrarPayload {
  tipo_graficacion: string;
  nombre: string;
  latitud: { hemisferio: 'N' | 'S'; grados: number; minutos: number; segundos: number };
  longitud: { hemisferio: 'W' | 'E'; grados: number; minutos: number; segundos: number };
  icono?: string;
  icono_id?: string;
}

export interface RegistroCoordenada {
  id: string;
  tipo_graficacion: string;
  nombre: string;
  latitud: unknown;
  longitud: unknown;
  sistema_referencia?: string;
  fecha_registro?: string;
  icono?: string;
  icono_id?: string;
}

export interface CoordenadasRegistrarResponse {
  ok: boolean;
  mensaje: string;
  registro?: RegistroCoordenada;
}

export interface SimulacionTrayectoriaRequest {
  p1: { id: string; latitud: number; longitud: number };
  p2: { id: string; latitud: number; longitud: number };
}

export interface PerfilElevacionPoint {
  indice: number; factor: number; distancia_m: number; latitud: number; longitud: number; terreno_msnm: number;
}

export interface SimulacionTrayectoriaResponse {
  simulacion: boolean;
  p1: { id: string; latitud: number; longitud: number; elevacion_msnm: number };
  p2: { id: string; latitud: number; longitud: number; elevacion_msnm: number };
  distancia_m: number;
  datos_simulados: { angulo_visual_grados: number; carga_simulada: number; apogeo_visual_m: number; tiempo_vuelo_simulado_s?: number };
  apogeo: { latitud: number; longitud: number; terreno_msnm: number; altura_visual_m: number; altitud_visual_msnm: number };
  resumen_perfil: { elevacion_minima_msnm: number; elevacion_maxima_msnm: number; elevacion_media_msnm: number; desnivel_p1_p2_m: number; muestras: number };
  perfil_elevacion: PerfilElevacionPoint[];
}

export interface InformePdfPayload {
  hoja_milimetrada?: string | null;
  mapa_2d?: string | null;
  mapa_3d?: string | null;
  perfil?: string | null;
  p1?: { id?: string | null; latitud: number; longitud: number } | null;
  p2?: { id?: string | null; latitud: number; longitud: number } | null;
  distancia_m?: number | null;
  azimut_mils?: number | null;
  elevacion_mils?: number | null;
  tiempo_vuelo_s?: number | null;
  carga?: string | null;
  resumen_perfil?: {
    elevacion_p1_msnm?: number | null;
    elevacion_p2_msnm?: number | null;
    elevacion_minima_msnm?: number | null;
    elevacion_maxima_msnm?: number | null;
    elevacion_media_msnm?: number | null;
    desnivel_p1_p2_m?: number | null;
  } | null;
}

@Injectable({ providedIn: 'root' })
export class VulcanoApiService {
  private readonly http = inject(HttpClient);
  private readonly config = inject(ApiConfigService);

  get baseUrl(): string { return this.config.getApiBaseUrl('vulcano'); }
  get healthUrl(): string { return this.config.joinUrl(this.baseUrl, environment.endpoints.demHealth); }
  get tilesUrl(): string { return this.config.joinUrl(this.baseUrl, environment.endpoints.demTiles); }

  elevationUrl(lat: number, lon: number): string {
    const query = new URLSearchParams({ lat: String(lat), lon: String(lon) });
    return `${this.config.joinUrl(this.baseUrl, environment.endpoints.demElevation)}?${query}`;
  }

  tileUrl(z: number, x: number, y: number): string {
    return this.tilesUrl.replace('{z}', String(z)).replace('{x}', String(x)).replace('{y}', String(y));
  }

  registrarCoordenadas(payload: CoordenadasRegistrarPayload): Promise<CoordenadasRegistrarResponse> {
    return firstValueFrom(this.http.post<CoordenadasRegistrarResponse>(
      environment.endpoints.coordenadasRegistrar,
      payload,
      { context: new HttpContext().set(LOADER_OPERATION, 'REGISTRAR COORDENADAS') },
    ).pipe(timeout(environment.timeout)));
  }

  simularTrayectoria(request: SimulacionTrayectoriaRequest): Observable<SimulacionTrayectoriaResponse> {
    return this.http.post<SimulacionTrayectoriaResponse>(environment.endpoints.simularTrayectoria, request);
  }

  generarInforme(payload: InformePdfPayload): Observable<Blob> {
    return this.http.post(environment.endpoints.generarInforme, payload, { responseType: 'blob' });
  }

  // Preserve status, headers and binary bodies used by the existing map diagnostics.
  // HttpClient ensures API calls reuse the existing authentication/error interceptors.
  async getResource(url: string): Promise<Response> {
    try {
      const response = await firstValueFrom(this.http.get(url, {
        observe: 'response', responseType: 'arraybuffer', cache: 'no-store',
      }).pipe(timeout(environment.timeout)));
      return this.toResponse(response.body, response.status, response.headers);
    } catch (error) {
      if (error instanceof HttpErrorResponse && error.status > 0) {
        return this.toResponse(error.error, error.status, error.headers);
      }
      throw error;
    }
  }

  private toResponse(body: ArrayBuffer | null, status: number, headers: HttpHeaders): Response {
    const resultHeaders = new Headers();
    for (const key of headers.keys()) resultHeaders.set(key, headers.get(key)!);
    return new Response(status === 204 || status === 205 || status === 304 ? null : body ? new Uint8Array(body) : null, {
      status, headers: resultHeaders,
    });
  }
}
