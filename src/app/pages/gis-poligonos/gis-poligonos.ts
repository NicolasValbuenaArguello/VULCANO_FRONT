import {
  AfterViewInit,
  Component,
  ChangeDetectorRef,
  DestroyRef,
  ElementRef,
  OnInit,
  OnDestroy,
  ViewChild,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import * as L from 'leaflet';
import * as ML from 'maplibre-gl';
import { PoligonosGisService } from '../../shared/gis-polygons/poligonos-gis.service';
import { PoligonoRegistro } from '../../shared/gis-polygons/poligono.model';

/** Visores GIS propios de esta pagina: no inyecta servicios ni capas de mapas operacionales. */
@Component({
  selector: 'app-gis-poligonos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: ` <section class="gis-page">
    <h1>ARCHIVO GIS DE POLIGONOS</h1>
    <p>
      Visores independientes WGS84, sin mapa base externo ni elevacion. La vista inclinada no
      representa relieve.
    </p>
    <div class="gis-toolbar">
      <button (click)="consultar()" [disabled]="cargando">ACTUALIZAR LISTA Y CAPAS</button>
      <label
        ><input type="checkbox" [(ngModel)]="nombres" (ngModelChange)="dibujar()" />Nombres</label
      >
      <label
        ><input type="checkbox" [(ngModel)]="vertices" (ngModelChange)="dibujar()" />Vertices</label
      >
    </div>
    <p role="status" aria-live="polite">{{ mensaje }}</p>
    <div class="gis-list">
      @for (registro of registros; track registro.id) {
        <div>
          <label
            ><input
              type="checkbox"
              [checked]="!ocultos.has(registro.id)"
              (change)="alternar(registro.id)"
            />{{ registro.nombre }}</label
          >
          <button (click)="centrar(registro)">CENTRAR</button><span>v{{ registro.version }}</span>
        </div>
      } @empty {
        <p>No hay poligonos cargados.</p>
      }
    </div>
    <div class="gis-views">
      <article>
        <h2>GIS 2D ? Leaflet</h2>
        <div #plano class="gis-map" aria-label="Visor GIS 2D"></div>
      </article>
      <article>
        <h2>GIS 3D INCLINADO ? MapLibre ? SIN DEM</h2>
        <div #inclinado class="gis-map" aria-label="Visor GIS inclinado sin terreno"></div>
      </article>
    </div>
  </section>`,
  styles: [
    `
      :host {
        display: block;
      }
      .gis-page {
        padding: 20px;
        background: #091109;
        color: #dce7d0;
        min-height: 100vh;
        box-sizing: border-box;
        font: 13px Arial;
      }
      h1,
      h2 {
        color: #b3a363;
      }
      h2 {
        font-size: 12px;
      }
      .gis-toolbar,
      .gis-list > div {
        display: flex;
        gap: 12px;
        align-items: center;
        flex-wrap: wrap;
      }
      button {
        background: #2879eb;
        border: 0;
        color: white;
        padding: 8px;
        border-radius: 3px;
        cursor: pointer;
      }
      button:disabled {
        opacity: 0.5;
      }
      .gis-list {
        max-height: 180px;
        overflow: auto;
        margin-bottom: 12px;
      }
      .gis-list > div {
        padding: 5px;
      }
      .gis-views {
        display: grid;
        grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
        gap: 12px;
      }
      article {
        min-width: 0;
      }
      .gis-map {
        height: 65vh;
        min-height: 280px;
        background: #dce3dd;
      }
      @media (max-width: 800px) {
        .gis-views {
          grid-template-columns: minmax(0, 1fr);
        }
      }
    `,
  ],
})
export class GisPoligonos implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('plano', { static: true }) private plano!: ElementRef<HTMLElement>;
  @ViewChild('inclinado', { static: true }) private inclinado!: ElementRef<HTMLElement>;
  private readonly cambio = inject(ChangeDetectorRef);
  private readonly api = inject(PoligonosGisService);
  private readonly destroyRef = inject(DestroyRef);
  private mapa2?: L.Map;
  private mapa3?: ML.Map;
  private capa?: L.LayerGroup;
  private marcadores: ML.Marker[] = [];
  private destruido = false;
  registros: PoligonoRegistro[] = [];
  ocultos = new Set<string>();
  nombres = true;
  vertices = false;
  cargando = false;
  mensaje = '';

  /** Inicia la consulta antes de comprobar la vista; admite tambien respuestas de cache sincronas. */
  ngOnInit(): void {
    this.consultar();
  }

  /** Inicializa motores ya instalados con fuentes vacias; no solicita teselas ni DEM de proveedores. */
  ngAfterViewInit(): void {
    this.mapa2 = L.map(this.plano.nativeElement, { center: [0, 0], zoom: 2 });
    this.capa = L.layerGroup().addTo(this.mapa2);
    try {
      this.mapa3 = new ML.Map({
        container: this.inclinado.nativeElement,
        center: [0, 0],
        zoom: 2,
        pitch: 55,
        style: {
          version: 8,
          sources: {},
          layers: [{ id: 'fondo', type: 'background', paint: { 'background-color': '#dce3dd' } }],
        },
      });
      this.mapa3.addControl(new ML.NavigationControl());
      this.mapa3.on('load', () => this.dibujar());
      this.mapa3.on('error', () => this.errorVisor());
    } catch {
      this.errorVisor();
    }
    this.dibujar();
  }

  /** Notifica fallos graficos fuera de la comprobacion inicial; no desactiva el visor 2D. */
  private errorVisor(): void {
    queueMicrotask(() => {
      if (!this.destruido) {
        this.mensaje = 'WebGL no disponible o error grafico; el visor 2D sigue activo.';
        this.cambio.markForCheck();
      }
    });
  }

  /** Consulta la fuente persistida y reemplaza las capas; un refresco no borra preferencias de visibilidad. */
  consultar(): void {
    if (this.cargando) return;
    this.cargando = true;
    this.api
      .obtenerPoligonos()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (registros) => {
          this.registros = registros;
          this.cargando = false;
          this.dibujar();
          this.mensaje = 'ARCHIVO GIS ACTUALIZADO';
          this.cambio.markForCheck();
        },
        error: (error) => {
          this.cargando = false;
          this.mensaje = error instanceof Error ? error.message : 'ERROR GIS';
          this.cambio.markForCheck();
        },
      });
  }

  /** @param id Identidad cuya visibilidad cambia en ambos visores, sin modificar persistencia. */
  alternar(id: string): void {
    this.ocultos.has(id) ? this.ocultos.delete(id) : this.ocultos.add(id);
    this.dibujar();
  }

  /** Reemplaza datos/capas por identidad. Escapa etiquetas mediante textContent, sin HTML recibido del servidor. */
  dibujar(): void {
    if (this.destruido || !this.capa) return;
    this.capa.clearLayers();
    this.marcadores.forEach((m) => m.remove());
    this.marcadores = [];
    const visibles = this.registros.filter((r) => !this.ocultos.has(r.id));
    for (const r of visibles) {
      const e = r.estilo;
      const poligono = L.polygon(
        r.vertices.map((v) => [v.latitud, v.longitud] as L.LatLngTuple),
        {
          color: e.colorLinea,
          fillColor: e.colorRelleno,
          fillOpacity: e.opacidadRelleno,
          opacity: e.opacidadLinea,
          weight: e.grosorLinea,
        },
      ).addTo(this.capa);
      if (this.nombres) {
        const nodo = document.createElement('span');
        nodo.textContent = r.nombre;
        poligono.bindTooltip(nodo, { permanent: true, direction: 'center' });
      }
      if (this.vertices)
        r.vertices.forEach((v, i) => {
          const etiqueta = document.createElement('span');
          etiqueta.textContent = `P${i + 1}`;
          L.circleMarker([v.latitud, v.longitud], {
            radius: 4,
            color: e.colorLinea,
            fillColor: e.colorRelleno,
            fillOpacity: 1,
          })
            .bindTooltip(etiqueta, { permanent: true })
            .addTo(this.capa!);
        });
    }
    const map = this.mapa3;
    if (!map?.isStyleLoaded()) return;
    const data: GeoJSON.FeatureCollection<GeoJSON.Polygon> = {
      type: 'FeatureCollection',
      features: visibles.map((r) => ({
        type: 'Feature',
        id: r.id,
        geometry: r.geometria,
        properties: { ...r.estilo },
      })),
    };
    const source = map.getSource('poligonos') as ML.GeoJSONSource | undefined;
    if (source) source.setData(data);
    else {
      map.addSource('poligonos', { type: 'geojson', data });
      map.addLayer({
        id: 'rellenos',
        type: 'fill',
        source: 'poligonos',
        paint: {
          'fill-color': ['get', 'colorRelleno'],
          'fill-opacity': ['get', 'opacidadRelleno'],
        },
      });
      map.addLayer({
        id: 'contornos',
        type: 'line',
        source: 'poligonos',
        paint: {
          'line-color': ['get', 'colorLinea'],
          'line-opacity': ['get', 'opacidadLinea'],
          'line-width': ['get', 'grosorLinea'],
        },
      });
    }
    for (const r of visibles) {
      if (this.nombres) {
        const bounds = new ML.LngLatBounds();
        r.vertices.forEach((v) => bounds.extend([v.longitud, v.latitud]));
        this.etiqueta3(r.nombre, bounds.getCenter().toArray());
      }
      if (this.vertices)
        r.vertices.forEach((v, i) => this.etiqueta3(`P${i + 1}`, [v.longitud, v.latitud]));
    }
  }

  /** @param texto Etiqueta de nombre o vertice. @param posicion Coordenada GeoJSON lon/lat. */
  private etiqueta3(texto: string, posicion: [number, number]): void {
    const nodo = document.createElement('span');
    nodo.textContent = texto;
    nodo.style.cssText =
      'background:#091109;color:white;padding:3px;border:1px solid #78813e;font:11px Arial;max-width:180px;overflow-wrap:anywhere';
    this.marcadores.push(new ML.Marker({ element: nodo }).setLngLat(posicion).addTo(this.mapa3!));
  }

  /** @param r Geometria a encuadrar simultaneamente. No usa posiciones de pantalla arbitrarias. */
  centrar(r: PoligonoRegistro): void {
    this.mapa2?.fitBounds(
      L.latLngBounds(r.vertices.map((v) => [v.latitud, v.longitud] as L.LatLngTuple)),
      { padding: [20, 20], maxZoom: 16 },
    );
    const bounds = new ML.LngLatBounds();
    r.vertices.forEach((v) => bounds.extend([v.longitud, v.latitud]));
    // Margen proporcional: una camara inclinada necesita mas espacio que una vista cenital.
    const margen = Math.max(
      20,
      Math.min(
        this.inclinado.nativeElement.clientWidth,
        this.inclinado.nativeElement.clientHeight,
      ) / 4,
    );
    this.mapa3?.fitBounds(bounds, { padding: margen, maxZoom: 16, pitch: 55, duration: 0 });
  }

  /** Libera motores/markers y cancela solicitudes al destruir la pagina, sin afectar mapas externos. */
  ngOnDestroy(): void {
    this.destruido = true;
    this.marcadores.forEach((m) => m.remove());
    this.mapa2?.remove();
    this.mapa3?.remove();
  }
}
