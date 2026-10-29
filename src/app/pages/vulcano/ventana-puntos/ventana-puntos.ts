import { AfterViewInit, Component, ElementRef, ViewChild, effect, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { GeographicPointsService, GeographicRecord, DEFAULT_POINT_STYLE, Dms, toDms, fromDms } from '../../../shared/geographic-points/geographic-points';
import { CoordinateSelectDirective } from '../ventana-limites-seguridad/coordinate-select.directive';
import { FloatingWindowBase } from '../../../shared/components/window-workspace/floating-window-base';
import { WindowManagerService } from '../../../shared/components/window-workspace/window-manager.service';
import { PointRemoteService } from '../../../shared/geographic-points/point-remote.service';

@Component({
  selector: 'app-ventana-puntos',
  standalone: true,
  imports: [FormsModule, CoordinateSelectDirective],
  providers: [WindowManagerService],
  templateUrl: './ventana-puntos.html',
  styleUrls: ['../menu/menu.css', '../ventana-sistemas-artilleria/ventana-sistemas-artilleria.css', './ventana-puntos.css'],
})
/** Formulario temporal y listado confirmado; delega persistencia en el coordinador compartido. */
export class VentanaPuntos extends FloatingWindowBase implements AfterViewInit {
  readonly state = inject(GeographicPointsService);
  readonly remote = inject(PointRemoteService);
  private alive = true;
  nombre = ''; observaciones = ''; latitud: number | null = 0; longitud: number | null = 0;
  latDms: Dms = toDms(0, true); lonDms: Dms = toDms(0, false);
  estilo = { ...DEFAULT_POINT_STYLE };
  editando: string | null = null;
  mensaje = 'LISTO PARA AGREGAR PUNTOS';
  readonly seleccionado = () => this.state.registros().find(p => p.id === this.state.seleccion());
  /** Escala esquematica del SVG, independiente de las distancias geograficas reales. */
  get previewRadius(): number { return Math.max(8, Math.min(70, Math.sqrt(this.estilo.radio || 0) * 2)); }
  @ViewChild('dialog', { static: true }) private dialog!: ElementRef<HTMLElement>;

  constructor() {
    super('puntos', 'PUNTOS', 1020, 650);
    effect(() => {
      const point = this.state.temporal();
      if (point) {
        this.latitud = point.latitud; this.longitud = point.longitud;
        this.latDms = toDms(point.latitud, true); this.lonDms = toDms(point.longitud, false);
        this.mensaje = 'UBICACIÓN SELECCIONADA. Confirme con AGREGAR PUNTO.';
      }
    });
  }

  /** Convierte la fila editada sin registrar ni emitir eventos de negocio. */
  cambiarDms(latitude: boolean): void {
    const value = fromDms(latitude ? this.latDms : this.lonDms, latitude);
    if (latitude) this.latitud = value; else this.longitud = value;
  }
  /** Convierte DD validos a DMS; conserva entradas invalidas para mostrar el error al confirmar. */
  cambiarDecimal(latitude: boolean): void {
    const value = latitude ? this.latitud : this.longitud;
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > (latitude ? 90 : 180)) return;
    if (latitude) this.latDms = toDms(value, true); else this.lonDms = toDms(value, false);
  }
  /** Alterna la captura compartida de un solo clic; no agrega filas. */
  seleccionarMapa(): void { this.state.captura.update(active => !active); }
  /** Espera POST/PUT confirmado; mantiene el borrador ante fallo y conserva el UUID al editar. */
  async agregar(): Promise<void> {
    if (this.remote.ocupado()) return;
    try {
      const record = await this.remote.guardar({ nombre: this.nombre, observaciones: this.observaciones,
        latitud: this.latitud as number, longitud: this.longitud as number, ...this.estilo }, this.editando);
      if (!this.alive) return;
      this.nuevo(); this.state.seleccion.set(record.id); this.mensaje = 'PUNTO CONFIRMADO POR EL SERVIDOR';
    } catch (error) { this.mensaje = error instanceof Error ? error.message : 'Revise los datos.'; }
  }
  /** Solo limpia el formulario temporal; los registros y capas confirmadas permanecen. */
  nuevo(): void {
    this.nombre = ''; this.observaciones = ''; this.editando = null;
    this.state.temporal.set(null); this.state.captura.set(false);
    this.mensaje = 'LISTO PARA AGREGAR PUNTOS';
  }
  /** Selecciona una fila para consultar su informacion, sin modificarla. */
  ver(p: GeographicRecord): void { this.state.seleccion.set(p.id); }
  /** Copia un registro a un borrador independiente; guardar actualiza solo ese ID. */
  editar(p: GeographicRecord): void {
    this.state.temporal.set(null); this.editando = p.id; this.nombre = p.nombre; this.observaciones = p.observaciones;
    this.latitud = p.latitud; this.longitud = p.longitud; this.latDms = toDms(p.latitud, true); this.lonDms = toDms(p.longitud, false);
    this.estilo = { radio: p.radio, relleno: p.relleno, opacidad: p.opacidad, linea: p.linea, grosor: p.grosor, marcador: p.marcador, tamano: p.tamano };
    this.ver(p); this.mensaje = 'EDITANDO PUNTO';
  }
  /** Elimina solo la fila confirmada; nunca borra capas ajenas. */
  async eliminar(p: GeographicRecord): Promise<void> {
    if (this.remote.ocupado()) return;
    if (!window.confirm(`¿Eliminar el punto «${p.nombre}»?`)) return;
    try {
      await this.remote.eliminar(p.id);
      if (this.alive) { if (this.editando === p.id) this.nuevo(); this.mensaje = 'PUNTO ELIMINADO DEL SERVIDOR'; }
    } catch (e) { if (this.alive) this.mensaje = e instanceof Error ? e.message : 'No se pudo eliminar el punto.'; }
  }
  /** Comprueba un POST sin respuesta mediante GET, sin volver a enviarlo. */
  async comprobarCreacion(): Promise<void> {
    try {
      const p = await this.remote.comprobarCreacion();
      if (p && this.alive) { this.nuevo(); this.state.seleccion.set(p.id); this.mensaje = 'CREACIÓN RECUPERADA Y CONFIRMADA'; }
    } catch (e) { if (this.alive) this.mensaje = e instanceof Error ? e.message : 'No se pudo comprobar el registro.'; }
  }
  /** Conserva los registros al cerrar y cancela un gesto de captura pendiente. */
  override ngOnDestroy(): void {
    this.alive = false;
    this.state.captura.set(false); this.state.temporal.set(null); super.ngOnDestroy();
  }

  /** Enfoca la ventana creada sin desplazar el mapa. */
  ngAfterViewInit(): void { this.focusWindow(); }

  /** Reutiliza el foco al traer al frente la misma instancia. */
  focusWindow(): void { this.dialog.nativeElement.focus({ preventScroll: true }); }
}
