import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, Subscription, catchError, finalize, map, of, shareReplay, tap, timeout } from 'rxjs';
import { VulcanoApiService } from '../../../core/services/vulcano-api.service';
import { GeographicPoint } from '../map-context-menu/map-actions.service';
import { TerrainHeight } from './measurement.models';

/** Consulta cancelable del DEM existente, con cache acotada y sin nuevas rutas del backend. */
@Injectable({ providedIn: 'root' })
export class TerrainElevationService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(VulcanoApiService);
  private readonly cache = new Map<string, { expires: number; value: TerrainHeight }>();
  private readonly pending = new Map<string, Observable<TerrainHeight>>();
  private inFlight = 0;
  private readonly queue: (() => void)[] = [];

  /** Cache aproximada a un metro; refCount cancela HTTP cuando no quedan consumidores. */
  get(point: GeographicPoint): Observable<TerrainHeight> {
    const key = `${point.latitud.toFixed(5)},${point.longitud.toFixed(5)}`;
    const cached = this.cache.get(key);
    if (cached && cached.expires > Date.now()) return of(cached.value);
    const pending = this.pending.get(key);
    if (pending) return pending;
    const request = this.limited(() => this.http.get<unknown>(this.api.elevationUrl(point.latitud, point.longitud)).pipe(timeout(4000))).pipe(
      map(value => this.parse(value)),
      catchError(() => of(this.unavailable())),
      tap(value => {
        if (this.cache.size >= 512) this.cache.delete(this.cache.keys().next().value!);
        this.cache.set(key, { value, expires: Date.now() + (value.metres === null ? 30000 : 300000) });
      }),
      finalize(() => this.pending.delete(key)),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    this.pending.set(key, request);
    return request;
  }

  /** Limita conjuntamente cursor, perfiles y consultas a cuatro HTTP simultaneos, cancelando cola y red. */
  private limited<T>(factory: () => Observable<T>): Observable<T> {
    return new Observable(subscriber => {
      let running = false;
      let subscription: Subscription | undefined;
      const start = () => { running = true; this.inFlight++; subscription = factory().subscribe(subscriber); };
      if (this.inFlight < 4) start();
      else this.queue.push(start);
      return () => {
        if (running) {
          subscription?.unsubscribe();
          this.inFlight--;
          while (this.inFlight < 4 && this.queue.length) this.queue.shift()!();
        } else {
          const index = this.queue.indexOf(start);
          if (index >= 0) this.queue.splice(index, 1);
        }
      };
    });
  }

  /** Solo acepta alturas numericas; null, banderas nodata y errores nunca se convierten a cero. */
  private parse(value: unknown): TerrainHeight {
    if (!value || typeof value !== 'object') return this.unavailable();
    const data = value as Record<string, unknown>;
    const height = data['elevacion'] ?? data['elevation'] ?? data['value'] ?? data['z'];
    if (typeof height !== 'number' || !Number.isFinite(height) || data['available'] === false || data['ok'] === false
      || data['nodata'] === true || data['nodata'] === height) return this.unavailable();
    const source = data['fuente'] ?? data['source'];
    const datum = data['datum_vertical'] ?? data['vertical_datum'];
    return { metres: height, source: typeof source === 'string' ? source : 'DEM VULCANO (backend)',
      verticalDatum: typeof datum === 'string' ? datum : 'Referencia vertical no informada' };
  }

  /** Estado explicito de falta de cobertura, sin reemplazarla por cotas de curvas o de camara. */
  private unavailable(): TerrainHeight { return { metres: null, source: 'DEM VULCANO (backend)', verticalDatum: 'Referencia vertical no informada' }; }
}
