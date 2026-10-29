import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { GeographicPointsService } from './geographic-points';
import { PointApiService, PointInput, pointPayload } from './point-api.service';

/** Coordina HTTP y la unica coleccion compartida. No mantiene otra lista de registros. */
@Injectable({ providedIn: 'root' })
export class PointRemoteService {
  private readonly api = inject(PointApiService);
  private readonly auth = inject(AuthService);
  private readonly state = inject(GeographicPointsService);
  readonly operacion = signal<'cargando' | 'guardando' | 'actualizando' | 'eliminando' | null>(null);
  readonly ocupado = computed(() => this.operacion() !== null);
  readonly cargado = signal(false);
  readonly error = signal<string | null>(null);
  readonly creacionPendiente = signal(false);
  private pending: { input: PointInput; before: Set<string> } | null = null;
  private generation = -1;
  private epoch = 0;

  constructor() {
    this.auth.registerSessionCleanup(() => this.reset());
    effect(() => {
      const token = this.auth.accessToken();
      if (token && this.generation !== this.auth.sessionGeneration) {
        this.reset(); this.generation = this.auth.sessionGeneration; void this.cargar();
      }
    });
  }
  /** Reinicia solo memoria al cambiar de sesion; nunca elimina datos del servidor. */
  private reset(): void {
    ++this.epoch; this.operacion.set(null); this.cargado.set(false); this.error.set(null);
    this.pending = null; this.creacionPendiente.set(false); this.state.limpiarSesion();
  }
  private start(operation: 'cargando' | 'guardando' | 'actualizando' | 'eliminando'): number {
    if (this.ocupado()) throw new Error('Hay una operación pendiente.');
    if (!this.auth.getToken()) throw new Error('Inicie sesión para consultar o guardar puntos.');
    this.operacion.set(operation); this.error.set(null); return this.epoch;
  }
  private check(epoch: number): void { if (epoch !== this.epoch) throw new Error('La sesión cambió; respuesta descartada.'); }
  private fail(error: unknown): Error {
    const status = error instanceof HttpErrorResponse ? error.status : -1;
    const messages: Record<number, string> = { 0: 'Error de conexión. Compruebe el servicio y reintente manualmente.',
      401: 'Autenticación ausente o inválida. Inicie sesión de nuevo.', 403: 'Permisos insuficientes para gestionar puntos.',
      404: 'El punto ya no existe. Recargue el listado.', 409: 'Conflicto de actualización o persistencia ocupada. Recargue antes de reintentar.',
      422: 'El servidor rechazó los datos. Revise los campos y el radio.', 500: 'Error del servidor al procesar puntos.' };
    const message = messages[status] ?? (status >= 500 ? 'El servidor no respondió correctamente.' :
      error instanceof Error && error.name !== 'TimeoutError' ? error.message : 'Tiempo de espera agotado. Compruebe la operación antes de reenviar.');
    this.error.set(message); return new Error(message);
  }
  /** Carga una vez por sesion, independientemente de que PUNTOS este abierta; permite recarga manual. */
  async cargar(): Promise<void> {
    if (this.ocupado()) return;
    let epoch = this.epoch;
    try {
      epoch = this.start('cargando'); const records = await firstValueFrom(this.api.listar()); this.check(epoch);
      this.state.cargarConfirmados(records); this.cargado.set(true);
    } catch (e) { if (epoch === this.epoch) this.fail(e); }
    finally { if (epoch === this.epoch) this.operacion.set(null); }
  }
  /** POST/PUT confirmado. Bloquea doble clic y no actualiza memoria ante error. */
  async guardar(input: PointInput, id: string | null = null) {
    const validation = this.state.validar(input); if (validation) throw new Error(validation);
    if (!this.cargado()) throw new Error('Cargue los puntos antes de guardar.');
    if (this.pending) throw new Error('Creación sin confirmar. Use COMPROBAR REGISTRO antes de volver a crear.');
    const epoch = this.start(id ? 'actualizando' : 'guardando');
    const candidate = { input: pointPayload(input), before: new Set(this.state.registros().map(p => p.id)) };
    try {
      const record = await firstValueFrom(id ? this.api.actualizar(id, input) : this.api.crear(input)); this.check(epoch);
      this.state.confirmar(record); return record;
    } catch (e) {
      if (epoch !== this.epoch) throw e;
      if (!id && (!(e instanceof HttpErrorResponse) || e.status === 0 || e.status >= 500)) {
        this.pending = candidate; this.creacionPendiente.set(true);
      }
      throw this.fail(e);
    } finally { if (epoch === this.epoch) this.operacion.set(null); }
  }
  /** DELETE solo retira el registro local tras recibir su confirmacion; conserva datos ante fallo. */
  async eliminar(id: string): Promise<void> {
    const epoch = this.start('eliminando');
    try { await firstValueFrom(this.api.eliminar(id)); this.check(epoch); this.state.eliminar(id); }
    catch (e) { if (epoch !== this.epoch) throw e; throw this.fail(e); }
    finally { if (epoch === this.epoch) this.operacion.set(null); }
  }
  /** Reconciliacion de solo lectura tras POST ambiguo; nunca repite automaticamente la mutacion. */
  async comprobarCreacion() {
    if (!this.pending) return null;
    const pending = this.pending, epoch = this.start('cargando');
    try {
      const records = await firstValueFrom(this.api.listar()); this.check(epoch);
      this.state.cargarConfirmados(records); this.cargado.set(true);
      const matches = records.filter(p => !pending.before.has(p.id) && JSON.stringify(pointPayload(p)) === JSON.stringify(pending.input));
      if (matches.length !== 1) throw new Error('No se puede confirmar una única creación. No se reenviará el POST; compruebe el servidor y vuelva a consultar.');
      this.pending = null; this.creacionPendiente.set(false); return matches[0];
    } catch (e) { if (epoch !== this.epoch) throw e; throw this.fail(e); }
    finally { if (epoch === this.epoch) this.operacion.set(null); }
  }
}

