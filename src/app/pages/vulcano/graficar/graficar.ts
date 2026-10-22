import { CommonModule } from '@angular/common';
import { Component, DestroyRef, EventEmitter, Input, OnDestroy, Output, inject } from '@angular/core';
import { GeographicPoint, validGeographicPoint } from '../../../shared/components/map-context-menu/map-actions.service';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MapaElementosService } from '../../../shared/services/mapa-elementos.service';
import { CoordenadaDms, ElementoMapa } from '../../../shared/models/elemento-mapa.model';
import { IconoSeleccionado, IconosService } from '../../../shared/services/iconos.service';
import { CoordenadasRegistrarPayload, RegistroCoordenada, VulcanoApiService } from '../../../core/services/vulcano-api.service';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TIPOS_GRAFICACION } from '../../../shared/constants/tipos-graficacion';

interface CoordenadaDmsFormulario {
  grados: number | null;
  minutos: number | null;
  segundos: number | null;
  decimal: number | null;
}

@Component({
  selector: 'app-graficar',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule],
  templateUrl: './graficar.html',
  styleUrl: './graficar.css',
})
export class Graficar implements OnDestroy {
  readonly tiposGraficacion = TIPOS_GRAFICACION;
  @Output() graficarElemento = new EventEmitter<ElementoMapa>();
  @Output() vistaPreviaSolicitada = new EventEmitter<ElementoMapa>();
  @Output() formularioLimpio = new EventEmitter<void>();
  @Output() abrirIconos = new EventEmitter<void>();
  @Output() coordenadaRegistrada = new EventEmitter<RegistroCoordenada>();

  latitud: CoordenadaDmsFormulario = this.crearCoordenada();
  longitud: CoordenadaDmsFormulario = this.crearCoordenada();
  hemisferioLatitud: 'LN' | 'LS' = 'LN';
  hemisferioLongitud: 'LW' | 'LE' = 'LW';

  /** Precarga solo coordenadas; los demas campos del formulario abierto permanecen intactos. */
  @Input() set coordenadasIniciales(point: GeographicPoint | null) {
    if (!point || !validGeographicPoint(point)) return;
    this.hemisferioLatitud = point.latitud < 0 ? 'LS' : 'LN';
    this.hemisferioLongitud = point.longitud < 0 ? 'LW' : 'LE';
    this.latitud = this.coordenadaDesdeDecimal(point.latitud);
    this.longitud = this.coordenadaDesdeDecimal(point.longitud);
  }

  /** Descompone la representacion DMS sin redondear la coordenada decimal capturada. */
  private coordenadaDesdeDecimal(decimal: number): CoordenadaDmsFormulario {
    const total = Math.abs(decimal) * 3600;
    const grados = Math.floor(Math.abs(decimal));
    const minutos = Math.floor((total - grados * 3600) / 60);
    return { grados, minutos, segundos: total - grados * 3600 - minutos * 60, decimal };
  }

  configuracion1 = '';
  configuracion2 = '';
  configuracion3 = '';

  iconoSeleccionado: string | null = null;
  imagenSeleccionada: string | null = null;

  archivoIcono: File | null = null;
  archivoImagen: File | null = null;
  nombreIcono: string | null = null;
  tipoIcono: string | null = null;
  nombreImagen: string | null = null;
  tipoImagen: string | null = null;

  readonly iconoTooltip = 'Seleccionar o visualizar icono';
  readonly imagenTooltip = 'Seleccionar o visualizar imagen';

  private readonly maxGradosLatitud = 90;
  private readonly maxGradosLongitud = 180;
  private readonly destroyRef = inject(DestroyRef);
  private registrando = false;

  constructor(
    private readonly mapaElementosService: MapaElementosService,
    private readonly iconosService: IconosService,
    private readonly vulcanoApi: VulcanoApiService,
  ) {
    this.iconosService.iconoSeleccionado$
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((icono) => {
        if (!icono) {
          return;
        }

        this.aplicarIconoSeleccionado(icono);
      });
  }

  onCoordenadaChange(tipo: 'latitud' | 'longitud'): void {
    const coordenada = tipo === 'latitud' ? this.latitud : this.longitud;
    const hemisferio = tipo === 'latitud' ? this.hemisferioLatitud : this.hemisferioLongitud;

    coordenada.decimal = this.convertirDmsADecimal(
      coordenada.grados,
      coordenada.minutos,
      coordenada.segundos,
      hemisferio,
    );
  }

  limpiarFormulario(): void {
    this.reiniciarArchivoLocal('icono');
    this.reiniciarArchivoLocal('imagen');
    this.iconosService.limpiarSeleccion();

    this.latitud = this.crearCoordenada();
    this.longitud = this.crearCoordenada();
    this.hemisferioLatitud = 'LN';
    this.hemisferioLongitud = 'LW';
    this.configuracion1 = '';
    this.configuracion2 = '';
    this.configuracion3 = '';
    this.formularioLimpio.emit();
  }

  mostrarVistaPrevia(): void {
    if (!this.validarFormulario(false)) {
      return;
    }

    this.vistaPreviaSolicitada.emit(this.construirElementoMapa());
  }

  async graficar(): Promise<void> {
    if (this.registrando || !this.validarFormulario(true)) {
      return;
    }

    const elemento = this.construirElementoMapa();
    const payload = this.construirPayloadCoordenadas();
    this.registrando = true;

    try {
      const response = await this.vulcanoApi.registrarCoordenadas(payload);
      const latitud = Number(response.registro?.latitud);
      const longitud = Number(response.registro?.longitud);
      if (!response.ok || !Number.isFinite(latitud) || !Number.isFinite(longitud)) {
        throw new Error(response.mensaje || 'El backend devolvio coordenadas invalidas.');
      }

      console.log('[GRAFICAR] respuesta backend', response.registro);
      const registro = response.registro!.icono
        ? response.registro!
        : {
            ...response.registro!,
            icono: elemento.icono ?? undefined,
            icono_id: this.iconosService.obtenerIconoSeleccionado()?.id,
          };
      this.coordenadaRegistrada.emit(registro);
      const persistido = this.mapaElementosService.agregarElemento({
        ...elemento,
        // El identificador persistido es la identidad única compartida por todas las vistas.
        idTemporal: response.registro!.id,
        latitud,
        longitud,
      });
      this.graficarElemento.emit(persistido);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'No fue posible registrar las coordenadas.';
      alert(message);
    } finally {
      this.registrando = false;
    }
  }

  async seleccionarIcono(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const archivo = input.files?.[0];

    if (!archivo) {
      return;
    }

    try {
      this.reiniciarArchivoLocal('icono');
      this.archivoIcono = archivo;
      this.nombreIcono = archivo.name;
      this.tipoIcono = archivo.type || null;
      this.iconoSeleccionado = await this.leerArchivoComoDataUrl(archivo);
      this.iconosService.seleccionarIconoArchivo({
        id: `archivo-${archivo.name}-${archivo.size}-${archivo.lastModified}`,
        nombre: archivo.name,
        categoria: 'Archivo',
        url: this.iconoSeleccionado,
        tipo: archivo.type || 'application/octet-stream',
        archivo,
      });
    } catch (error) {
      this.reiniciarArchivoLocal('icono');
      console.error('[Graficar] No fue posible leer el icono seleccionado.', error);
      alert('No fue posible leer el icono seleccionado.');
    } finally {
      input.value = '';
    }
  }

  seleccionarImagen(event: Event): void {
    const input = event.target as HTMLInputElement;
    const archivo = input.files?.[0];

    if (!archivo) {
      return;
    }

    this.reiniciarArchivoLocal('imagen');
    this.archivoImagen = archivo;
    this.nombreImagen = archivo.name;
    this.tipoImagen = archivo.type || null;
    this.imagenSeleccionada = URL.createObjectURL(archivo);
    input.value = '';
  }

  validarGrados(tipo: 'latitud' | 'longitud'): void {
    const coordenada = tipo === 'latitud' ? this.latitud : this.longitud;
    const maxGrados = tipo === 'latitud' ? this.maxGradosLatitud : this.maxGradosLongitud;

    coordenada.grados = this.limitarEntero(coordenada.grados, 0, maxGrados);
    coordenada.minutos = this.limitarEntero(coordenada.minutos, 0, 59);
    coordenada.segundos = this.limitarDecimal(coordenada.segundos, 0, 59.999999);

    this.onCoordenadaChange(tipo);
  }

  abrirVentanaIconos(): void {
    this.abrirIconos.emit();
  }

  prepararDatosParaGuardar(): FormData {
    const formData = new FormData();
    const elemento = this.construirElementoMapa();

    formData.append('idTemporal', elemento.idTemporal);
    formData.append('latitud', String(elemento.latitud));
    formData.append('longitud', String(elemento.longitud));
    formData.append('hemisferioLatitud', elemento.hemisferioLatitud);
    formData.append('hemisferioLongitud', elemento.hemisferioLongitud);
    formData.append('gradosLatitud', String(elemento.coordenadasDms.latitud.grados));
    formData.append('minutosLatitud', String(elemento.coordenadasDms.latitud.minutos));
    formData.append('segundosLatitud', String(elemento.coordenadasDms.latitud.segundos));
    formData.append('gradosLongitud', String(elemento.coordenadasDms.longitud.grados));
    formData.append('minutosLongitud', String(elemento.coordenadasDms.longitud.minutos));
    formData.append('segundosLongitud', String(elemento.coordenadasDms.longitud.segundos));
    formData.append('configuracion1', elemento.configuracion1 ?? '');
    formData.append('configuracion2', elemento.configuracion2 ?? '');
    formData.append('configuracion3', elemento.configuracion3 ?? '');
    formData.append('fechaCreacion', elemento.fechaCreacion);
    formData.append('icono', elemento.icono ?? '');
    formData.append('imagen', elemento.imagen ?? '');
    formData.append('nombreIcono', elemento.nombreIcono ?? '');
    formData.append('tipoIcono', elemento.tipoIcono ?? '');
    formData.append('nombreImagen', elemento.nombreImagen ?? '');
    formData.append('tipoImagen', elemento.tipoImagen ?? '');

    if (elemento.archivoIcono) {
      formData.append('archivoIcono', elemento.archivoIcono, elemento.archivoIcono.name);
    }

    if (elemento.archivoImagen) {
      formData.append('archivoImagen', elemento.archivoImagen, elemento.archivoImagen.name);
    }

    return formData;
  }

  ngOnDestroy(): void {
    this.reiniciarArchivoLocal('icono');
    this.reiniciarArchivoLocal('imagen');
  }

  private construirElementoMapa(): ElementoMapa {
    if (!this.esCoordenadaValida('latitud') || !this.esCoordenadaValida('longitud')) {
      throw new Error('El formulario geográfico requiere coordenadas numéricas completas y finitas.');
    }
    return {
      idTemporal: this.generarIdTemporal(),
      latitud: this.latitud.decimal!,
      longitud: this.longitud.decimal!,
      hemisferioLatitud: this.hemisferioLatitud,
      hemisferioLongitud: this.hemisferioLongitud,
      coordenadasDms: {
        latitud: this.coordenadaDmsEntera(this.latitud),
        longitud: this.coordenadaDmsEntera(this.longitud),
      },
      icono: this.iconoSeleccionado,
      imagen: this.imagenSeleccionada,
      configuracion1: this.configuracion1 || null,
      configuracion2: this.configuracion2 || null,
      configuracion3: this.configuracion3 || null,
      archivoIcono: this.archivoIcono,
      nombreIcono: this.nombreIcono,
      tipoIcono: this.tipoIcono,
      archivoImagen: this.archivoImagen,
      nombreImagen: this.nombreImagen,
      tipoImagen: this.tipoImagen,
      fechaCreacion: new Date().toISOString(),
    };
  }

  private coordenadaDmsEntera(coordenada: CoordenadaDmsFormulario): CoordenadaDms {
    return {
      grados: this.normalizarEntero(coordenada.grados),
      minutos: this.normalizarEntero(coordenada.minutos),
      segundos: this.normalizarEntero(coordenada.segundos),
    };
  }

  private crearCoordenada(): CoordenadaDmsFormulario {
    return {
      grados: null,
      minutos: null,
      segundos: null,
      decimal: null,
    };
  }

  private convertirDmsADecimal(
    grados: number | null,
    minutos: number | null,
    segundos: number | null,
    hemisferio: 'LN' | 'LS' | 'LW' | 'LE',
  ): number | null {
    if (![grados, minutos, segundos].every(value => typeof value === 'number' && Number.isFinite(value))) {
      return null;
    }

    const decimal = Math.abs(grados!) + Math.abs(minutos!) / 60 + Math.abs(segundos!) / 3600;
    const esNegativo = hemisferio === 'LS' || hemisferio === 'LW';
    const resultado = esNegativo ? -decimal : decimal;

    const redondeado = Math.round(resultado * 1_000_000) / 1_000_000;
    return Number.isFinite(redondeado) ? redondeado : null;
  }

  private validarFormulario(mostrarAlertas: boolean): boolean {
    if (this.latitud.decimal == null || !this.esCoordenadaValida('latitud')) {
      this.mostrarAlerta('Debe ingresar una latitud válida.', mostrarAlertas);
      return false;
    }

    if (this.longitud.decimal == null || !this.esCoordenadaValida('longitud')) {
      this.mostrarAlerta('Debe ingresar una longitud válida.', mostrarAlertas);
      return false;
    }

    if (!this.iconoSeleccionado) {
      this.mostrarAlerta('Debe seleccionar un icono para graficar.', mostrarAlertas);
      return false;
    }

    if (!this.configuracion1.trim()) {
      this.mostrarAlerta('Debe seleccionar un tipo de graficacion.', mostrarAlertas);
      return false;
    }

    if (!this.configuracion2.trim()) {
      this.mostrarAlerta('Debe ingresar un nombre.', mostrarAlertas);
      return false;
    }

    return true;
  }

  private construirPayloadCoordenadas(): CoordenadasRegistrarPayload {
    return {
      tipo_graficacion: this.configuracion1.trim(),
      nombre: this.configuracion2.trim(),
      latitud: {
        hemisferio: this.hemisferioLatitud === 'LN' ? 'N' : 'S',
        grados: this.latitud.grados!,
        minutos: this.latitud.minutos!,
        segundos: this.latitud.segundos!,
      },
      longitud: {
        hemisferio: this.hemisferioLongitud === 'LW' ? 'W' : 'E',
        grados: this.longitud.grados!,
        minutos: this.longitud.minutos!,
        segundos: this.longitud.segundos!,
      },
    };
  }

  private esCoordenadaValida(tipo: 'latitud' | 'longitud'): boolean {
    const coordenada = tipo === 'latitud' ? this.latitud : this.longitud;

    return [coordenada.grados, coordenada.minutos, coordenada.segundos, coordenada.decimal]
      .every(value => typeof value === 'number' && Number.isFinite(value));
  }

  private mostrarAlerta(mensaje: string, habilitada: boolean): void {
    if (habilitada) {
      alert(mensaje);
    }
  }

  private limitarEntero(valor: number | string | null | undefined, min: number, max: number): number | null {
    const normalizado = this.normalizarNumero(valor);
    if (normalizado == null) {
      return null;
    }

    return Math.min(Math.max(Math.trunc(normalizado), min), max);
  }

  private limitarDecimal(valor: number | string | null | undefined, min: number, max: number): number | null {
    const normalizado = this.normalizarNumero(valor);
    if (normalizado == null) {
      return null;
    }

    return Math.min(Math.max(normalizado, min), max);
  }

  private normalizarNumero(valor: number | string | null | undefined): number | null {
    if (valor == null || (typeof valor === 'string' && valor.trim() === '')) {
      return null;
    }

    const numero = typeof valor === 'number' ? valor : Number(valor);
    return Number.isFinite(numero) ? numero : null;
  }

  private normalizarEntero(valor: number | null): number {
    return Number.isFinite(valor ?? NaN) ? Math.trunc(valor as number) : 0;
  }

  private generarIdTemporal(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }

    return `tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  private reiniciarArchivoLocal(tipo: 'icono' | 'imagen'): void {
    if (tipo === 'icono') {
      this.revocarUrlLocal(this.iconoSeleccionado);
      this.iconoSeleccionado = null;
      this.archivoIcono = null;
      this.nombreIcono = null;
      this.tipoIcono = null;
      return;
    }

    this.revocarUrlLocal(this.imagenSeleccionada);
    this.imagenSeleccionada = null;
    this.archivoImagen = null;
    this.nombreImagen = null;
    this.tipoImagen = null;
  }

  private revocarUrlLocal(url: string | null): void {
    if (!url || typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') {
      return;
    }

    if (url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  }

  private aplicarIconoSeleccionado(icono: IconoSeleccionado): void {
    if (this.iconoSeleccionado && this.iconoSeleccionado !== icono.url) {
      this.revocarUrlLocal(this.iconoSeleccionado);
    }

    this.iconoSeleccionado = icono.url;
    this.nombreIcono = icono.nombre;
    this.tipoIcono = icono.tipo;
    this.archivoIcono = icono.archivo;
  }

  private leerArchivoComoDataUrl(archivo: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const lector = new FileReader();

      lector.onload = () => {
        const resultado = lector.result;

        if (typeof resultado === 'string') {
          resolve(resultado);
          return;
        }

        reject(new Error('No fue posible leer el archivo del icono.'));
      };

      lector.onerror = () => {
        reject(lector.error ?? new Error('No fue posible leer el archivo del icono.'));
      };

      lector.readAsDataURL(archivo);
    });
  }
}
