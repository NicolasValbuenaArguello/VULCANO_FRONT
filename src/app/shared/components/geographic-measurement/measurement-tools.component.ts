import { AfterViewInit, Component, DestroyRef, ElementRef, HostListener, Input, inject, signal } from '@angular/core';
import { MeasurementService } from './measurement.service';
import { MeasurementTool } from './measurement.models';
import { formatDistance } from './geographic-math';

/** Misma interfaz compacta para ambos visores; solo administra herramientas de consulta. */
@Component({
  selector: 'app-measurement-tools', standalone: true,
  template: `
    <div class="geo-tools">
      <button type="button" class="geo-tools-toggle" [class.geo-tool-active]="!!state.tool()" [attr.aria-expanded]="open()" (click)="open.set(!open())">⌖ MEDICIÓN</button>
      @if (open()) {
        <section class="geo-tools-panel" aria-label="Herramientas de medición">
          <strong>MEDICIÓN GEOGRÁFICA</strong>
          @for (item of tools; track item.id) {
            <button type="button" [class.geo-tool-active]="state.tool() === item.id" [attr.aria-pressed]="state.tool() === item.id" (click)="state.start(item.id)">{{ item.label }}</button>
          }
          <button type="button" (click)="state.clear()">LIMPIAR MEDICIONES</button>
          @if (state.tool()) { <p>Clic izquierdo: seleccionar puntos. ESC: cancelar.</p> }
          @if (state.tool() === 'route') {
            <p>{{ state.draft().length }} puntos seleccionados</p>
            <p>Acumulado horizontal: {{ distance(state.draftDistance()) }}</p>
            <button type="button" [disabled]="state.draft().length < 2" (click)="state.finishRoute()">FINALIZAR RECORRIDO</button>
          }
          @if (state.draft().length) { <button type="button" (click)="state.undo()">DESHACER ÚLTIMO PUNTO</button> }
          <p>Distancias horizontales: referencia esférica (R = 6 371 km).</p>
          @for (measurement of state.measurements(); track measurement.id) {
            <article class="geo-result">
              <strong>{{ title(measurement.tool) }}</strong>
              @if (measurement.tool === 'angle') {
                <p>{{ measurement.angle === null ? measurement.message : measurement.angle.toFixed(2) + '° · ' + (measurement.angle * 6400 / 360).toFixed(1) + ' mils (6400)' }}</p>
              } @else if (measurement.tool !== 'elevation') {
                <p>Horizontal: {{ distance(measurement.horizontal) }}</p>
              }
              @if (measurement.tool === 'route') {
                @for (segment of measurement.segments; track $index) { <p>Tramo {{ $index + 1 }}: {{ distance(segment) }}</p> }
              }
              @if (measurement.tool === 'elevation') {
                <p>{{ measurement.loading ? 'Consultando...' : measurement.samples[0]?.metres != null ? measurement.samples[0].metres!.toFixed(2) + ' m' : 'Elevación no disponible' }}</p>
                @if (measurement.samples[0]; as height) { <p>{{ height.source }} · {{ height.verticalDatum }}</p> }
              }
              @if (threeDimensional && measurement.tool === 'distance') {
                <button type="button" [disabled]="measurement.loading" (click)="state.loadTerrain(measurement.id, false)">CONSULTAR RECTA ESPACIAL</button>
              }
              @if (threeDimensional && (measurement.tool === 'distance' || measurement.tool === 'route')) {
                <button type="button" [disabled]="measurement.loading" (click)="state.loadTerrain(measurement.id, true)">MUESTREAR RELIEVE</button>
              }
              @if (measurement.tool !== 'elevation' && measurement.loading) { <p>Consultando DEM...</p> }
              @if (measurement.spatial !== null) { <p>Recta espacial estimada con cotas DEM: {{ distance(measurement.spatial) }}</p> }
              @if (measurement.relief !== null) { <p>Sobre relieve (estimado): {{ distance(measurement.relief) }}</p> }
              @if (measurement.message) { <p>{{ measurement.message }}</p> }
              @if (measurement.tool === 'profile' && measurement.chart) {
                <svg class="geo-profile" viewBox="0 0 300 140" role="img" aria-label="Perfil real muestreado del DEM">
                  <path d="M12 15V115H288" fill="none" stroke="#53602a" />
                  <polyline [attr.points]="measurement.chart" fill="none" stroke="#49c979" stroke-width="2" />
                  <text x="12" y="137">0 m</text><text x="288" y="137" text-anchor="end">{{ distance(measurement.horizontal) }}</text>
                </svg>
                <p>Mín: {{ measurement.minimum!.toFixed(2) }} m · Máx: {{ measurement.maximum!.toFixed(2) }} m</p>
                <p>Desnivel final − inicial: {{ measurement.heightDifference!.toFixed(2) }} m</p>
                <p>{{ measurement.samples[0].source }} · Muestreo máximo: 33 puntos, no es un perfil de precisión topográfica.</p>
              }
            </article>
          }
        </section>
      }
    </div>
    <output class="geo-cursor" aria-label="Coordenadas bajo el cursor">
      @if (state.cursor(); as cursor) {
        <span>LAT: {{ cursor.point.latitud.toFixed(6) }}° · LON: {{ cursor.point.longitud.toFixed(6) }}°</span>
        <span>{{ dms(cursor.point.latitud, true) }} · {{ dms(cursor.point.longitud, false) }}</span>
        @if (cursor.projected; as xy) { <span>X: {{ xy.x.toFixed(2) }} · Y: {{ xy.y.toFixed(2) }} · EPSG:9377</span> }
        @else { <span>X/Y EPSG:9377: fuera del ámbito nacional</span> }
        <span>ALT: {{ cursor.loading ? 'Consultando...' : cursor.elevation?.metres != null ? cursor.elevation!.metres!.toFixed(2) + ' m' : 'Elevación no disponible' }}</span>
        @if (cursor.elevation?.metres != null) { <span>{{ cursor.elevation!.source }} · {{ cursor.elevation!.verticalDatum }}</span> }
      } @else { <span>Coordenadas no disponibles</span> }
    </output>
  `,
})
export class MeasurementToolsComponent implements AfterViewInit {
  @Input() threeDimensional = false;
  readonly distance = formatDistance;
  readonly state = inject(MeasurementService);
  readonly open = signal(false);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly lifetime = inject(DestroyRef);
  readonly tools: { id: MeasurementTool; label: string }[] = [
    { id: 'distance', label: 'DISTANCIA' }, { id: 'angle', label: 'ÁNGULO' },
    { id: 'elevation', label: 'ELEVACIÓN' }, { id: 'route', label: 'RECORRIDO' },
    { id: 'profile', label: 'PERFIL DEL TERRENO' },
  ];

  /** Cierra el panel al usar capas u otros controles, sin desactivar ni borrar mediciones. */
  constructor() {
    const outside = (event: Event) => { if (!this.host.nativeElement.contains(event.target as Node)) this.open.set(false); };
    document.addEventListener('pointerdown', outside, true);
    this.lifetime.onDestroy(() => document.removeEventListener('pointerdown', outside, true));
  }

  /** Ajusta el desplazamiento interno al alto real del mapa, tambien en visores embebidos. */
  ngAfterViewInit(): void {
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => {
      this.host.nativeElement.style.setProperty('--geo-panel-height', `${Math.max(70, entry.contentRect.height - 240)}px`);
    });
    observer.observe(this.host.nativeElement);
    this.lifetime.onDestroy(() => observer.disconnect());
  }

  /** Titulo de una medicion terminada, compartido entre motores. */
  title(tool: MeasurementTool): string { return this.tools.find(item => item.id === tool)?.label ?? tool; }

  /** Presentacion DMS con acarreo al siguiente grado y convenciones N/S, E/W. */
  dms(value: number, latitude: boolean): string {
    const total = Math.round(Math.abs(value) * 3600 * 100);
    const degrees = Math.floor(total / 360000);
    const minutes = Math.floor(total / 6000) % 60;
    const seconds = ((total % 6000) / 100).toFixed(2);
    return `${degrees}° ${minutes}′ ${seconds}″ ${latitude ? value < 0 ? 'S' : 'N' : value < 0 ? 'W' : 'E'}`;
  }

  /** Impide que los gestos sobre la interfaz accionen zoom, desplazamiento o clics del mapa. */
  @HostListener('pointerdown', ['$event'])
  @HostListener('mousedown', ['$event'])
  @HostListener('click', ['$event'])
  @HostListener('dblclick', ['$event'])
  @HostListener('wheel', ['$event'])
  @HostListener('contextmenu', ['$event'])
  isolate(event: Event): void { event.stopPropagation(); }
}
