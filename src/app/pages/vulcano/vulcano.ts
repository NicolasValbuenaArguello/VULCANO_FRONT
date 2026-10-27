import { ChangeDetectorRef, Component, DestroyRef, inject, signal, ViewChild } from '@angular/core';
import { MapActionsService } from '../../shared/components/map-context-menu/map-actions.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import * as L from 'leaflet';
import { MapaTresD } from './mapa-tres-d/mapa-tres-d';
import { Menu } from './menu/menu';
import { MapaComponent } from '../../shared/components/mapa/mapa';
import { HojaMilimetradaComponent } from './hoja-milimetrada/hoja-milimetrada.component';
import { InformePdfPayload, RegistroCoordenada, SimulacionTrayectoriaResponse, VulcanoApiService } from '../../core/services/vulcano-api.service';
import { RelacionFijada } from '../../shared/models/relacion-fijada.model';
import { defer, finalize, firstValueFrom, Subscription, timeout } from 'rxjs';
import { LoaderService } from '../../core/services/loader.service';

type VistaPrincipal = '2d' | '3d' | 'hoja-milimetrada';

interface EstadoCamaraMapa {
  lat: number;
  lng: number;
  zoom2D: number;
  zoom3D: number;
  bearing3D: number;
  pitch3D: number;
}

@Component({
  selector: 'app-vulcano',
  standalone: true,
  imports: [Menu, MapaComponent, MapaTresD, HojaMilimetradaComponent],
  templateUrl: './vulcano.html',
  styleUrl: './vulcano.css',
})
export class Vulcano {
  private readonly mapActions = inject(MapActionsService);
  private readonly changeDetector = inject(ChangeDetectorRef);
  readonly loader = inject(LoaderService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly lifetime = new AbortController();
  private simulacionSubscription?: Subscription;
  @ViewChild(Menu) private readonly menuRef?: Menu;
  @ViewChild(MapaComponent) private readonly mapa2dRef?: MapaComponent;
  @ViewChild(MapaTresD) private readonly mapa3dRef?: MapaTresD;
  @ViewChild(HojaMilimetradaComponent) private readonly hojaMilimetradaRef?: HojaMilimetradaComponent;
  private primeraEntrada3D = true;

  vistaActiva: VistaPrincipal = '2d';
  registrosCoordenadas: readonly RegistroCoordenada[] = [];
  relacionFijada: RelacionFijada | null = null;
  private readonly simulacionState = signal<SimulacionTrayectoriaResponse | null>(null);
  get simulacionTrayectoria(): SimulacionTrayectoriaResponse | null { return this.simulacionState(); }
  set simulacionTrayectoria(value: SimulacionTrayectoriaResponse | null) { this.simulacionState.set(value); }
  get calculandoTrayectoria(): boolean { return this.loader.isActive('SIMULACION'); }
  get generandoInforme(): boolean { return this.loader.isActive('INFORME'); }
  private readonly detalleInformeState = signal('');
  get detalleInforme(): string { return this.detalleInformeState(); }
  set detalleInforme(value: string) { this.detalleInformeState.set(value); }
  errorSimulacion: string | null = null;
  private claveSimulacion: string | null = null;
  private solicitudSimulacion = 0;
  private readonly estadoCamaraPredeterminado: EstadoCamaraMapa = {
    lat: 4.5709,
    lng: -74.2973,
    zoom2D: 6,
    zoom3D: 1.8,
    bearing3D: 0,
    pitch3D: 0,
  };

  estadoCamara: EstadoCamaraMapa = { ...this.estadoCamaraPredeterminado };
  centroMapa2D: L.LatLngExpression = [this.estadoCamara.lat, this.estadoCamara.lng];
  centroMapa3D: [number, number] = [this.estadoCamara.lng, this.estadoCamara.lat];
  zoomMapa2D = this.estadoCamara.zoom2D;
  zoomMapa3D = this.estadoCamara.zoom3D;
  bearingMapa3D = this.estadoCamara.bearing3D;
  pitchMapa3D = this.estadoCamara.pitch3D;

  /** Conecta las acciones explicitas de ambos mapas con las ventanas existentes del padre. */
  constructor(private readonly vulcanoApi: VulcanoApiService) {
    this.destroyRef.onDestroy(() => this.lifetime.abort());
    this.mapActions.requested$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(request => {
      if (request.action === 'graficar') this.menuRef?.openGraficarWindow(request.point);
      else if (request.action === 'limites-seguridad') this.menuRef?.openLimitesWindow();
      else this.hojaMilimetradaRef?.abrirProyeccionDesdeMapa(request.point, request.host);
      this.changeDetector.markForCheck();
    });
  }

  async generarInformePdf(): Promise<void> {
    if (!this.relacionFijada || !this.simulacionTrayectoria) { alert('FIJE DOS PUNTOS PARA GENERAR EL INFORME'); return; }
    if (this.generandoInforme) return;
    const release = this.loader.acquire('INFORME');
    try {
      this.detalleInforme = 'Preparando hoja milimetrada...';
      const hoja = await this.capturarEtapa('hoja', async () => this.limitarCaptura(await this.hojaMilimetradaRef!.capturarHojaParaInforme()));
      this.detalleInforme = 'Preparando mapa 2D...';
      const mapa2d = await this.capturarEtapa('mapa2d', async () => this.limitarCaptura(await this.mapa2dRef!.capturarParaInforme()));
      this.detalleInforme = 'Preparando mapa 3D...';
      const mapa3d = await this.capturarEtapa('mapa3d', async () => this.limitarCaptura(await this.mapa3dRef!.capturarParaInforme()));
      this.detalleInforme = 'Preparando perfil...';
      const perfil = await this.capturarEtapa('perfil', async () => this.limitarCaptura(await this.hojaMilimetradaRef!.capturarPerfilParaInforme()));
      this.detalleInforme = 'Generando PDF...';
      const s = this.simulacionTrayectoria;
      const payload: InformePdfPayload = {
        hoja_milimetrada: hoja, mapa_2d: mapa2d, mapa_3d: mapa3d, perfil,
        p1: this.construirPuntoInforme(s.p1), p2: this.construirPuntoInforme(s.p2),
        distancia_m: this.numeroONull(s.distancia_m),
        azimut_mils: 0, elevacion_mils: this.numeroONull(s.datos_simulados.angulo_visual_grados * 6400 / 360),
        carga: s.datos_simulados.carga_simulada == null ? null : String(s.datos_simulados.carga_simulada),
        tiempo_vuelo_s: this.numeroONull(s.datos_simulados.tiempo_vuelo_simulado_s),
        resumen_perfil: {
          elevacion_p1_msnm: this.numeroONull(s.p1.elevacion_msnm),
          elevacion_p2_msnm: this.numeroONull(s.p2.elevacion_msnm),
          elevacion_minima_msnm: this.numeroONull(s.resumen_perfil.elevacion_minima_msnm),
          elevacion_maxima_msnm: this.numeroONull(s.resumen_perfil.elevacion_maxima_msnm),
          elevacion_media_msnm: this.numeroONull(s.resumen_perfil.elevacion_media_msnm),
          desnivel_p1_p2_m: this.numeroONull(s.resumen_perfil.desnivel_p1_p2_m),
        },
      };
      const blob = await firstValueFrom(this.vulcanoApi.generarInforme(payload).pipe(timeout(30_000), takeUntilDestroyed(this.destroyRef)));
      if (blob.size === 0) throw new Error('El backend devolvió un PDF vacío.');
      const firma = new Uint8Array(await this.conTimeout(blob.slice(0, 4).arrayBuffer(), 10_000, 'lectura PDF'));
      if (String.fromCharCode(...firma) !== '%PDF') throw new Error('La respuesta del backend no es un PDF válido.');
      this.detalleInforme = 'Descargando informe...';
      const url = URL.createObjectURL(blob);
      try {
        const anchor = document.createElement('a'); anchor.href = url; anchor.download = this.nombreInforme(); anchor.click();
      } finally { URL.revokeObjectURL(url); }
    } catch (error) {
      if (this.lifetime.signal.aborted) return;
      console.error('[INFORME] HTTP ERROR', error);
      const errorBody = await this.obtenerCuerpoErrorInforme(error);
      if (this.lifetime.signal.aborted) return;
      const httpError = error as { status?: unknown };
      console.error('[INFORME PDF] STATUS:', httpError.status);
      console.error('[INFORME PDF] ERROR:', errorBody);
      console.error('[INFORME PDF] DETAIL:', errorBody?.detail);
      if (Array.isArray(errorBody?.detail)) {
        errorBody.detail.forEach((item: any) => console.error('[INFORME PDF VALIDACION]', item.loc, item.msg, item.type, item.input));
      }
      console.error('[INFORME] No fue posible generar el PDF.', error);
      alert('NO FUE POSIBLE GENERAR EL INFORME');
    } finally {
      this.detalleInforme = '';
      release();
    }
  }

  private nombreInforme(): string {
    const d = new Date(); const p = (n: number) => String(n).padStart(2, '0');
    return `INFORME_VULCANO_${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.pdf`;
  }

  private numeroONull(valor: unknown): number | null {
    const numero = Number(valor);
    return Number.isFinite(numero) ? numero : null;
  }

  private construirPuntoInforme(punto: { id?: unknown; latitud?: unknown; longitud?: unknown } | null): InformePdfPayload['p1'] {
    if (!punto) return null;
    const latitud = this.numeroONull(punto.latitud);
    const longitud = this.numeroONull(punto.longitud);
    if (latitud === null || longitud === null) return null;
    return { id: typeof punto.id === 'string' ? punto.id : null, latitud, longitud };
  }

  private async limitarCaptura(captura: string): Promise<string | null> {
    const limite = 14_000_000;
    if (!captura || !captura.startsWith('data:image/')) return null;
    if (captura.length <= limite) return captura;
    console.warn('[INFORME PDF] Reduciendo captura que supera el límite:', captura.length);
    const imagen = new Image();
    await new Promise<void>((resolve, reject) => { imagen.onload = () => resolve(); imagen.onerror = () => reject(new Error('No fue posible reducir la captura.')); imagen.src = captura; });
    let ancho = imagen.naturalWidth;
    let alto = imagen.naturalHeight;
    let reducida = captura;
    while (reducida.length > limite && ancho > 1 && alto > 1) {
      ancho = Math.max(1, Math.floor(ancho * 0.75));
      alto = Math.max(1, Math.floor(alto * 0.75));
      const canvas = document.createElement('canvas');
      canvas.width = ancho;
      canvas.height = alto;
      canvas.getContext('2d')?.drawImage(imagen, 0, 0, ancho, alto);
      reducida = canvas.toDataURL('image/png');
    }
    return reducida.length <= limite ? reducida : null;
  }

  private async obtenerCuerpoErrorInforme(error: unknown): Promise<any> {
    const body = (error as { error?: unknown })?.error;
    if (body instanceof Blob) {
      try { return JSON.parse(await this.conTimeout(body.text(), 10_000, 'lectura error PDF')); } catch { return body; }
    }
    return body;
  }

  private conTimeout<T>(promesa: Promise<T>, ms: number, etapa: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const signal = this.lifetime.signal;
      if (signal.aborted) { void promesa.catch(() => {}); reject(new Error('Operacion cancelada')); return; }
      const cleanup = () => {
        window.clearTimeout(temporizador);
        signal.removeEventListener('abort', abort);
      };
      const abort = () => { cleanup(); reject(new Error('Operacion cancelada')); };
      const temporizador = window.setTimeout(() => { cleanup(); reject(new Error(`Timeout generando ${etapa}`)); }, ms);
      signal.addEventListener('abort', abort, { once: true });
      promesa.then(valor => {
        cleanup();
        resolve(valor);
      }, error => {
        cleanup();
        reject(error);
      });
    });
  }

  private async capturarEtapa<T>(etapa: string, captura: () => Promise<T>): Promise<T> {
    return this.conTimeout(captura(), 10_000, `captura ${etapa}`);
  }

  /** Abre desde la Hoja la misma ventana de graficacion administrada por el menu. */
  abrirVentanaGraficar(): void { this.menuRef?.openGraficarWindow(); }

  abrirCatalogoIconos(): void { this.menuRef?.openIconosWindow(); }

  /**
   * Recibe desde Menu la vista principal solicitada.
   *
   * '2d' = vista Vulcano actual
   * '3d' = MapaTresD
   */
  onVistaChange(vista: VistaPrincipal): void {
    console.log('[VULCANO] Cambio de vista:', vista);
    console.log('[VULCANO STATE]', {
      vistaActivaAnterior: this.vistaActiva,
      vistaNueva: vista,
    });

    if (this.mapa3dRef?.isBaselineDiagnosticActive()) {
      console.log('[VULCANO] Cambio de vista bloqueado durante baseline');
      return;
    }

    this.mapActions.close();

    if (vista !== this.vistaActiva && this.calculandoTrayectoria) {
      ++this.solicitudSimulacion;
      this.simulacionSubscription?.unsubscribe();
      this.claveSimulacion = null;
    }

    this.capturarEstadoCamaraActual();

    if (vista === 'hoja-milimetrada') {
      this.vistaActiva = vista;
      return;
    }

    if (vista === '3d') {
      this.aplicarEstadoCamaraAEntradas(45);
      this.vistaActiva = vista;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.mapa3dRef?.activarVista3D();
          this.mapa3dRef?.onVistaVisible();
        });
      });
      return;
    }

    this.aplicarEstadoCamaraAEntradas();
    this.vistaActiva = vista;
    this.mapa3dRef?.activarVista2D();
  }

  onCoordenadaRegistrada(registro: RegistroCoordenada): void {
    console.log('[PADRE] registro recibido', registro);
    this.registrosCoordenadas = [
      ...this.registrosCoordenadas.filter(item => item.id !== registro.id),
      registro,
    ];
  }

  onRelacionFijada(relacion: RelacionFijada | null): void {
    const clave = relacion ? `${relacion.origenId}->${relacion.destinoId}` : null;
    if (clave && clave === this.claveSimulacion && (this.simulacionTrayectoria || this.calculandoTrayectoria)) return;
    const solicitud = ++this.solicitudSimulacion;
    this.simulacionSubscription?.unsubscribe();
    this.relacionFijada = relacion;
    this.simulacionTrayectoria = null;
    this.errorSimulacion = null;
    this.claveSimulacion = clave;
    if (!relacion) return;
    const p1 = this.registrosCoordenadas.find(item => item.id === relacion.origenId);
    const p2 = this.registrosCoordenadas.find(item => item.id === relacion.destinoId);
    if (!p1 || !p2) return;
    this.simulacionSubscription = defer(() => {
      const release = this.loader.acquire('SIMULACION');
      return defer(() => this.vulcanoApi.simularTrayectoria({
        p1: { id: p1.id, latitud: Number(p1.latitud), longitud: Number(p1.longitud) },
        p2: { id: p2.id, latitud: Number(p2.latitud), longitud: Number(p2.longitud) },
      })).pipe(timeout(30_000), finalize(release));
    }).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: respuesta => {
        if (solicitud !== this.solicitudSimulacion) return;
        this.simulacionTrayectoria = respuesta;
        console.log('[TRAYECTORIA 3D] respuesta recibida', {
          muestras: respuesta.perfil_elevacion?.length, p1: respuesta.p1, apogeo: respuesta.apogeo, p2: respuesta.p2,
        });
      },
      error: error => {
        if (solicitud !== this.solicitudSimulacion) return;
        this.simulacionTrayectoria = null;
        this.errorSimulacion = error instanceof Error ? error.message : 'No fue posible obtener la simulación.';
        console.error('[SIMULACION] ERROR', error);
      },
    });
  }

  private capturarEstadoCamaraActual(): void {
    if (this.vistaActiva === 'hoja-milimetrada') {
      return;
    }

    if (this.vistaActiva === '2d') {
      const estado2D = this.mapa2dRef?.obtenerEstadoCamara();
      if (!estado2D) {
        return;
      }

      this.estadoCamara = {
        lat: estado2D.lat,
        lng: estado2D.lng,
        zoom2D: estado2D.zoom,
        zoom3D: estado2D.zoom,
        bearing3D: this.estadoCamara.bearing3D,
        pitch3D: this.estadoCamara.pitch3D,
      };
      return;
    }

    const estado3D = this.mapa3dRef?.obtenerEstadoCamara();
    if (!estado3D) {
      return;
    }

    this.estadoCamara = {
      lat: estado3D.lat,
      lng: estado3D.lng,
      zoom2D: estado3D.zoom,
      zoom3D: estado3D.zoom,
      bearing3D: estado3D.bearing,
      pitch3D: estado3D.pitch,
    };
  }

  private aplicarEstadoCamaraAEntradas(pitch3DOverride?: number): void {
    this.centroMapa2D = [this.estadoCamara.lat, this.estadoCamara.lng];
    this.centroMapa3D = [this.estadoCamara.lng, this.estadoCamara.lat];
    this.zoomMapa2D = this.estadoCamara.zoom2D;
    this.zoomMapa3D =
      pitch3DOverride !== undefined && this.primeraEntrada3D
        ? Math.max(this.estadoCamara.zoom3D, 8)
        : this.estadoCamara.zoom3D;
    this.bearingMapa3D = this.estadoCamara.bearing3D;
    this.pitchMapa3D = pitch3DOverride ?? this.estadoCamara.pitch3D;

    if (pitch3DOverride !== undefined) {
      this.primeraEntrada3D = false;
    }
  }
}
