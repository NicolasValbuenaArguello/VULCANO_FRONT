import type { EstiloPoligono } from '../../../shared/gis-polygons/poligono.model';
import {
  AfterViewInit,
  Component,
  Input,
  ElementRef,
  ViewChild,
  Injector,
  ChangeDetectorRef,
  inject,
  afterNextRender,
  Output,
  EventEmitter,
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CoordinateSelectDirective } from './coordinate-select.directive';
import { GeographicPoint, validGeographicPoint } from '../../../shared/components/map-context-menu/map-actions.service';

import { FloatingWindowBase } from '../../../shared/components/window-workspace/floating-window-base';
import { WindowManagerService } from '../../../shared/components/window-workspace/window-manager.service';
import { GisPoligonosService, PoligonoDemo } from '../../../shared/services/gis-poligonos.service';

/**
 * Vértice geográfico en coordenadas WGS84.
 */
interface Vertice {
  id: number;
  latitud: number;
  longitud: number;
}

/** Contrato GeoJSON local, sin API ni persistencia remota. */
export interface FeaturePoligono {
  type: 'Feature';
  /** Identidad local de la geometria finalizada; independiente del registro backend. */
  id?: string;
  properties: { nombre: string; descripcion: string; estilo: EstiloPoligono };
  geometry: { type: 'Polygon'; coordinates: [number, number][][] };
}

@Component({
  selector: 'app-ventana-limites-seguridad',
  standalone: true,
  imports: [CommonModule, FormsModule, CoordinateSelectDirective],
  providers: [WindowManagerService],
  templateUrl: './ventana-limites-seguridad.html',
  styleUrls: [
    '../menu/menu.css',
    '../ventana-sistemas-artilleria/ventana-sistemas-artilleria.css',
    './ventana-limites-seguridad.css',
  ],
})
export class VentanaLimitesSeguridad extends FloatingWindowBase implements AfterViewInit {
  /** Cambia solo al abrir una nueva creacion, nunca al restaurar la ventana. */
  @Input() set nuevaApertura(_revision: number) {
    this.reiniciarNuevoPoligono();
  }
  @Input() capturaCoordenadasActiva = false;
  @Input() cantidadCapturasVisuales = 0;
  @Output() limpiarCapturaVisual = new EventEmitter<void>();
  @Output() capturaCoordenadasActivaChange = new EventEmitter<boolean>();
  /** Solo reemplaza el borrador visible; conserva vertices, edicion y resultados existentes. */
  @Input() set coordenadaMapaSeleccionada(point: GeographicPoint | null) {
    if (!point || !validGeographicPoint(point)) return;
    const lat = this.decimalADMS(point.latitud);
    const lon = this.decimalADMS(point.longitud);
    this.latHemisferio = point.latitud < 0 ? 'S' : 'N';
    this.lonHemisferio = point.longitud < 0 ? 'W' : 'E';
    this.latGrados = lat.grados;
    this.latMinutos = lat.minutos;
    this.latSegundos = lat.segundos;
    this.lonGrados = lon.grados;
    this.lonMinutos = lon.minutos;
    this.lonSegundos = lon.segundos;
    // La captura solo llena campos: los vertices del borrador se agregan explicitamente.
    this.agregarPunto()

  }

  @ViewChild('dialog', { static: true })
  private dialog!: ElementRef<HTMLElement>;

  @Output()
  poligonoCreado = new EventEmitter<FeaturePoligono>();

  // ==================================================
  // DATOS DEL POLÍGONO
  // ==================================================

  private readonly renderInjector = inject(Injector);
  private readonly cambio = inject(ChangeDetectorRef);
  private revisionValidacion = 0;
  private readonly gisService = inject(GisPoligonosService);
  /** Estados de la ultima comprobacion del borrador; no indican publicacion en mapas. */
  estadoGeometria: 'pendiente' | 'validada' | 'invalida' = 'pendiente';
  estadoGeoJSON: 'pendiente' | 'generado' = 'pendiente';
  estadoVistaPrevia: 'pendiente' | 'actualizada' = 'pendiente';
  geoJSONGenerado: FeaturePoligono | null = null;

  /** Invalida el resultado ante cambios reales del borrador y descarta callbacks de render anteriores.
   * La vista SVG sigue siendo dinamica; no se envia ningun evento a mapas ni solicitudes HTTP.
   */
  invalidarResultado(): void {
    this.revisionValidacion++;
    this.estadoGeometria = 'pendiente';
    this.estadoGeoJSON = 'pendiente';
    this.estadoVistaPrevia = 'pendiente';
    this.geoJSONGenerado = null;
    this.mensajeEstado =
      'CAMBIOS LOCALES. VALIDACION Y GEOJSON PENDIENTES; VISTA PREVIA SVG DINAMICA.';
  }

  nombrePoligono = '';
  /** Metadato opcional conservado para reutilizar generarGeoJSON(), sin controles de archivo. */
  descripcionPoligono = '';

  vertices: Vertice[] = [];

  private siguienteId = 1;

  indiceEdicion: number | null = null;

  mensajeEstado = 'LISTO PARA AGREGAR PUNTOS';

  // ==================================================
  // COORDENADAS DMS
  // ==================================================

  latHemisferio: 'N' | 'S' = 'N';
  latGrados = 0;
  latMinutos = 0;
  latSegundos = 0;

  lonHemisferio: 'E' | 'W' = 'W';
  lonGrados = 0;
  lonMinutos = 0;
  lonSegundos = 0;

  // ==================================================
  // ESTILO DEL POLÍGONO
  // ==================================================

  estilo: EstiloPoligono = {
    colorRelleno: '#579bda',
    colorLinea: '#ffffff',
    opacidadRelleno: 0.65,
    opacidadLinea: 1,
    grosorLinea: 2.5,
  };

  // ==================================================
  // CONSTRUCTOR
  // ==================================================

  constructor() {
    super('limites-seguridad', 'LÍMITES DE SEGURIDAD', 850, 550);
    
  }

  /** Enfoca el dialogo al abrir sin desplazar el documento. */
  ngAfterViewInit(): void {
    this.focusWindow();
    this.limpiarVertices()
  }

  /** Conserva el foco accesible de la ventana existente; no altera su administracion. */
  focusWindow(): void {
    this.dialog.nativeElement.focus({
      preventScroll: true,
    });
  }

  // ==================================================
  // CONVERSIÓN DMS A DECIMAL
  // ==================================================

  /** Convierte DMS a DD, sin aceptar valores vacios como cero. No emite eventos ni realiza HTTP. */
  private convertirDMS(
    grados: number,
    minutos: number,
    segundos: number,
    hemisferio: string,
  ): number {
    if (![grados, minutos, segundos].every((v) => typeof v === 'number' && Number.isFinite(v)))
      return NaN;
    const signo = hemisferio === 'S' || hemisferio === 'W' ? -1 : 1;
    return Number(((grados + minutos / 60 + segundos / 3600) * signo).toFixed(8));
  }

  /** @returns Latitud DD derivada del formulario DMS, con signo N/S. */
  get latitudDecimal(): number {
    return this.convertirDMS(this.latGrados, this.latMinutos, this.latSegundos, this.latHemisferio);
  }

  /** @returns Longitud DD derivada del formulario DMS, con signo E/W. */
  get longitudDecimal(): number {
    return this.convertirDMS(this.lonGrados, this.lonMinutos, this.lonSegundos, this.lonHemisferio);
  }

  /**
   * Valida los valores antes de registrar
   * un vértice geográfico.
   */
  private coordenadasValidas(): boolean {
    const valores = [
      this.latGrados,
      this.latMinutos,
      this.latSegundos,
      this.lonGrados,
      this.lonMinutos,
      this.lonSegundos,
    ];

    if (valores.some((v) => typeof v !== 'number' || !Number.isFinite(v))) {
      return false;
    }

    const [latG, latM, latS, lonG, lonM, lonS] = valores;

    return (
      ['N', 'S'].includes(this.latHemisferio) &&
      ['E', 'W'].includes(this.lonHemisferio) &&
      (latG !== 90 || (latM === 0 && latS === 0)) &&
      (lonG !== 180 || (lonM === 0 && lonS === 0)) &&
      Number.isInteger(latG) &&
      Number.isInteger(lonG) &&
      Number.isInteger(latM) &&
      Number.isInteger(lonM) &&
      latG >= 0 &&
      latG <= 90 &&
      lonG >= 0 &&
      lonG <= 180 &&
      latM >= 0 &&
      latM < 60 &&
      lonM >= 0 &&
      lonM < 60 &&
      latS >= 0 &&
      latS < 60 &&
      lonS >= 0 &&
      lonS < 60 &&
      Math.abs(this.latitudDecimal) <= 90 &&
      Math.abs(this.longitudDecimal) <= 180
    );
  }

  // ==================================================
  // AGREGAR O ACTUALIZAR VÉRTICE
  // ==================================================

  /** Registra o actualiza desde DMS validos; conserva el ID al editar y rechaza vecinos coincidentes.
   * Actualiza vertices y mensajeEstado; solo afecta al editor local.
   */
  agregarPunto(): void {
    if (!this.coordenadasValidas()) {
      this.mensajeEstado = 'COORDENADAS INVALIDAS';
      return;
    }
    const indice = this.indiceEdicion ?? this.vertices.length;
    if (
      !Number.isInteger(indice) ||
      indice < 0 ||
      (this.indiceEdicion !== null && !this.vertices[indice])
    ) {
      this.indiceEdicion = null;
      this.mensajeEstado = 'VERTICE NO ENCONTRADO';
      return;
    }
    const punto = {
      id: this.vertices[indice]?.id ?? this.siguienteId,
      latitud: this.latitudDecimal,
      longitud: this.longitudDecimal,
    };
    const vecinos =
      this.indiceEdicion === null
        ? [this.vertices.at(-1), this.vertices[0]]
        : [
            this.vertices[(indice + this.vertices.length - 1) % this.vertices.length],
            this.vertices[(indice + 1) % this.vertices.length],
          ];
    if (vecinos.some((v) => v && v.id !== punto.id && this.mismoPunto(v, punto))) {
      this.mensajeEstado = 'NO SE ADMITEN VERTICES CONSECUTIVOS DUPLICADOS';
      return;
    }
    this.invalidarResultado();
    if (this.indiceEdicion !== null) {
      this.vertices[indice] = punto;
      this.indiceEdicion = null;
      this.mensajeEstado = 'VERTICE ACTUALIZADO';
    } else {
      this.vertices.push(punto);
      this.siguienteId++;
      this.mensajeEstado = 'VERTICE AGREGADO';
    }
  }

  /** Compara coordenadas almacenadas (DD a ocho decimales), sin redondear la presentacion a seis. */
  private mismoPunto(a: Vertice, b: Vertice): boolean {
    return a.latitud === b.latitud && a.longitud === b.longitud;
  }

  // ==================================================
  // EDITAR VÉRTICE
  // ==================================================

  /** @param indice Posicion en la tabla. Carga DMS con su hemisferio y conserva el ID para actualizar. */
  editarVertice(indice: number): void {
    const punto = this.vertices[indice];
    if (!Number.isInteger(indice) || !punto) return;

    this.indiceEdicion = indice;

    const lat = this.decimalADMS(punto.latitud);
    const lon = this.decimalADMS(punto.longitud);

    this.latHemisferio = punto.latitud < 0 ? 'S' : 'N';

    this.lonHemisferio = punto.longitud < 0 ? 'W' : 'E';

    this.latGrados = lat.grados;
    this.latMinutos = lat.minutos;
    this.latSegundos = lat.segundos;

    this.lonGrados = lon.grados;
    this.lonMinutos = lon.minutos;
    this.lonSegundos = lon.segundos;

    this.mensajeEstado = 'EDITANDO VÉRTICE';
  }

  // ==================================================
  // DECIMAL A DMS
  // ==================================================

  /** @param valor Coordenada DD validada. @returns DMS absolutos con acarreo de segundos/minutos. */
  private decimalADMS(valor: number): { grados: number; minutos: number; segundos: number } {
    const absoluto = Math.abs(valor);

    let grados = Math.floor(absoluto);

    let minutos = Math.floor((absoluto - grados) * 60);

    let segundos = Number(((absoluto - grados - minutos / 60) * 3600).toFixed(4));

    if (segundos >= 60) {
      segundos = 0;
      minutos++;
    }

    if (minutos >= 60) {
      minutos = 0;
      grados++;
    }

    return { grados, minutos, segundos };
  }

  // ==================================================
  // ELIMINAR VÉRTICE
  // ==================================================

  /** @param indice Posicion a eliminar. Cancela la edicion para no actualizar otra fila desplazada. */
  eliminarVertice(indice: number): void {
    if (!Number.isInteger(indice) || indice < 0 || indice >= this.vertices.length) {
      return;
    }

    this.invalidarResultado();
    this.vertices.splice(indice, 1);

    this.indiceEdicion = null;
    this.mensajeEstado = 'VÉRTICE ELIMINADO';
  }

  // ==================================================
  // LIMPIAR
  // ==================================================

  /** Limpia exclusivamente los vertices del editor local; conserva nombre y estilo. */
  limpiarVertices(): void {
    this.invalidarResultado();
    this.vertices = [];
    this.indiceEdicion = null;
    this.siguienteId = 1;

    this.mensajeEstado = 'VÉRTICES LIMPIADOS';
  }

  /** Reinicia solo el borrador local; no borra capas compartidas ni registros guardados. */
  reiniciarNuevoPoligono(): void {
    this.limpiarVertices();
    this.nombrePoligono = '';
    this.descripcionPoligono = '';
    this.latHemisferio = 'N';
    this.lonHemisferio = 'W';
    this.latGrados = this.latMinutos = this.latSegundos = 0;
    this.lonGrados = this.lonMinutos = this.lonSegundos = 0;
    this.mensajeEstado = 'LISTO PARA AGREGAR PUNTOS';
  }

  // ==================================================
  // REPRESENTACIÓN SVG
  // ==================================================

  /** Proyeccion compartida de vista previa, sin motor de mapas: equirectangular local con
   * correccion coseno de latitud y escala uniforme. @returns Puntos SVG y vertices del mismo calculo.
   * No es una transformacion para mediciones ni para representaciones operativas.
   */
  get vistaPrevia(): { puntos: string; vertices: (Vertice & { x: number; y: number })[] } {
    if (!this.vertices.length) return { puntos: '', vertices: [] };
    const lons = this.vertices.map((p) => p.longitud),
      lats = this.vertices.map((p) => p.latitud);
    const centroLon = (Math.min(...lons) + Math.max(...lons)) / 2;
    const centroLat = (Math.min(...lats) + Math.max(...lats)) / 2;
    const factor = Math.max(Math.cos((centroLat * Math.PI) / 180), 1e-6);
    const puntos = this.vertices.map((p) => ({
      ...p,
      x: (p.longitud - centroLon) * factor,
      y: p.latitud - centroLat,
    }));
    const rangoX = Math.max(...puntos.map((p) => p.x)) - Math.min(...puntos.map((p) => p.x));
    const rangoY = Math.max(...puntos.map((p) => p.y)) - Math.min(...puntos.map((p) => p.y));
    const escala = Math.min(rangoX ? 430 / rangoX : Infinity, rangoY ? 270 / rangoY : Infinity);
    const k = Number.isFinite(escala) ? escala : 1;
    const vertices = puntos.map((p) => ({ ...p, x: 250 + p.x * k, y: 170 - p.y * k }));
    return { vertices, puntos: vertices.map((p) => `${p.x},${p.y}`).join(' ') };
  }

  /** @returns Contorno calculado por la misma proyeccion que circulos y etiquetas. */
  get puntosSVG(): string {
    return this.vistaPrevia.puntos;
  }

  /** Valida un anillo simple local antes de graficar o exportar. No modifica vertices ni hace HTTP.
   * @returns false para duplicados, degeneracion, cruces, contactos o estilos invalidos.
   * Poligonos que requieren corte del antimeridiano se rechazan explicitamente, sin exportarlos incorrectamente.
   */
  private geometriaValida(): boolean {
    const fallo = (mensaje: string): false => {
      this.estadoGeometria = 'invalida';
      this.mensajeEstado = 'GEOMETRIA INVALIDA: ' + mensaje;
      return false;
    };
    const vs = this.vertices;
    if (vs.length < 3) return fallo('SE REQUIEREN 3 VERTICES DISTINTOS');
    if (
      vs.some(
        (p) =>
          !Number.isFinite(p.latitud) ||
          !Number.isFinite(p.longitud) ||
          Math.abs(p.latitud) > 90 ||
          Math.abs(p.longitud) > 180,
      )
    )
      return fallo('COORDENADAS INVALIDAS');
    if (new Set(vs.map((p) => `${p.latitud},${p.longitud}`)).size !== vs.length)
      return fallo('EL POLIGONO CONTIENE VERTICES REPETIDOS');
    const minX = Math.min(...vs.map((p) => p.longitud)),
      maxX = Math.max(...vs.map((p) => p.longitud));
    if (maxX - minX > 180) return fallo('EL POLIGONO REQUIERE CORTE EN EL ANTIMERIDIANO');
    const minY = Math.min(...vs.map((p) => p.latitud)),
      maxY = Math.max(...vs.map((p) => p.latitud));
    const rango = Math.max(maxX - minX, maxY - minY);
    const ps = vs.map((p) => ({ x: (p.longitud - minX) / rango, y: (p.latitud - minY) / rango }));
    const eps = 1e-10;
    type Punto = { x: number; y: number };
    const orientacion = (a: Punto, b: Punto, c: Punto) =>
      (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    const enSegmento = (a: Punto, b: Punto, c: Punto) =>
      Math.abs(orientacion(a, b, c)) <= eps &&
      c.x >= Math.min(a.x, b.x) - eps &&
      c.x <= Math.max(a.x, b.x) + eps &&
      c.y >= Math.min(a.y, b.y) - eps &&
      c.y <= Math.max(a.y, b.y) + eps;
    for (let i = 0; i < ps.length; i++) {
      const a = ps[i],
        b = ps[(i + 1) % ps.length],
        siguiente = ps[(i + 2) % ps.length];
      if (enSegmento(a, b, siguiente) || enSegmento(b, siguiente, a))
        return fallo('EL CONTORNO TIENE SEGMENTOS SUPERPUESTOS');
      for (let j = i + 2; j < ps.length; j++) {
        if (i === 0 && j === ps.length - 1) continue;
        const c = ps[j],
          d = ps[(j + 1) % ps.length];
        const o1 = orientacion(a, b, c),
          o2 = orientacion(a, b, d),
          o3 = orientacion(c, d, a),
          o4 = orientacion(c, d, b);
        if (
          (((o1 > eps && o2 < -eps) || (o1 < -eps && o2 > eps)) &&
            ((o3 > eps && o4 < -eps) || (o3 < -eps && o4 > eps))) ||
          enSegmento(a, b, c) ||
          enSegmento(a, b, d) ||
          enSegmento(c, d, a) ||
          enSegmento(c, d, b)
        )
          return fallo('EL POLIGONO SE AUTOINTERSECTA');
      }
    }
    const areaDoble = ps.reduce((s, a, i) => {
      const b = ps[(i + 1) % ps.length];
      return s + a.x * b.y - b.x * a.y;
    }, 0);
    if (Math.abs(areaDoble) <= eps) return fallo('EL POLIGONO NO TIENE SUPERFICIE');
    this.estadoGeometria = 'validada';
    const e = this.estilo;
    if (
      ![e.colorRelleno, e.colorLinea].every((c) => /^#[0-9a-f]{6}$/i.test(c)) ||
      ![e.opacidadRelleno, e.opacidadLinea, e.grosorLinea].every(Number.isFinite) ||
      e.opacidadRelleno < 0 ||
      e.opacidadRelleno > 1 ||
      e.opacidadLinea < 0 ||
      e.opacidadLinea > 1 ||
      e.grosorLinea <= 0
    ) {
      this.mensajeEstado = 'GEOMETRIA VALIDADA. ESTILO INVALIDO; NO SE GENERO GEOJSON.';
      return false;
    }
    return true;
  }

  /** @returns Feature GeoJSON valido o null y mensaje de error. Cierra el anillo en longitud, latitud
   * sin duplicar el punto inicial en el estado editable. Coordenadas WGS84 implicitas en GeoJSON,
   * sin campos CRS no estandar. Actualiza el estado y el resultado en memoria; no realiza HTTP.
   */
  generarGeoJSON(): FeaturePoligono | null {
    this.invalidarResultado();
    if (!this.nombrePoligono.trim()) {
      this.mensajeEstado = 'FALTA EL NOMBRE DEL POLIGONO; NO SE GENERO GEOJSON.';
      return null;
    }
    if (!this.geometriaValida()) return null;
    const coordenadas: [number, number][] = this.vertices.map((p) => [p.longitud, p.latitud]);
    coordenadas.push([...coordenadas[0]]);
    const feature: FeaturePoligono = {
      type: 'Feature',
      properties: {
        nombre: this.nombrePoligono.trim(),
        descripcion: this.descripcionPoligono,
        estilo: { ...this.estilo },
      },
      geometry: { type: 'Polygon', coordinates: [coordenadas] },
    };
    this.geoJSONGenerado = feature;
    this.estadoGeoJSON = 'generado';
    this.mensajeEstado = 'GEOMETRIA VALIDADA. GEOJSON GENERADO EN MEMORIA; SIN ENVIO A MAPAS.';
    return feature;
  }

  /** Valida nombre/geometria y genera el Feature en memoria; no publica capas, persiste ni hace HTTP.
   * La vista SVG ya es reactiva: confirma sus atributos despues del render, no solo al validar datos.
   * Una edicion posterior cancela la confirmacion anterior mediante revisionValidacion.
   */
  graficar(): void {
    const feature = this.generarGeoJSON();
    if (!feature) return;
    const revision = this.revisionValidacion;
    const puntosEsperados = this.vistaPrevia.puntos;
      // Enviar el polígono al componente padre.
  this.poligonoCreado.emit(feature);
    this.mensajeEstado =
      'GEOMETRIA VALIDADA. GEOJSON GENERADO EN MEMORIA. SVG PENDIENTE; SIN ENVIO A MAPAS.';
    afterNextRender(
      () => {
        if (revision !== this.revisionValidacion) return;
        const poligono = this.dialog.nativeElement.querySelector('svg polygon');
        if (poligono?.getAttribute('points') !== puntosEsperados) return;
        this.estadoVistaPrevia = 'actualizada';
        this.mensajeEstado =
          'GEOMETRIA VALIDADA. GEOJSON GENERADO EN MEMORIA. VISTA PREVIA SVG ACTUALIZADA; SIN ENVIO A MAPAS.';
        this.cambio.markForCheck();
      },
      { injector: this.renderInjector },
    );
    this.probarEnvio(feature)
  }
  



probarEnvio(poligono: FeaturePoligono): void {
  const poligonoPrueba: PoligonoDemo = {
    nombre: poligono.properties.nombre,
    descripcion: poligono.properties.descripcion,
    geometry: poligono.geometry
  };

  this.gisService.registrar(poligonoPrueba).subscribe({
    next: (respuesta) => {
      console.log('Respuesta del servidor:', respuesta);
    },
    error: (error) => {
      console.error('Error HTTP:', error.status);
    }
  });
}

}
