import { AfterViewInit, Directive, ElementRef, HostListener, Input, OnDestroy, inject } from '@angular/core';

/** Traslada el modal existente al visor que lo solicito, conservando su vista Angular. */
@Directive({ selector: '[appMapActionPortal]', standalone: true })
export class MapActionPortalDirective implements AfterViewInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private destination: HTMLElement | null = null;
  private anchor?: Comment;

  /** Actualiza solo el destino visual cuando la misma proyeccion se solicita desde otro visor. */
  @Input() set appMapActionPortal(destination: HTMLElement | null) {
    this.destination = destination;
    this.sync();
  }

  /** Guarda el punto de retorno y las variables visuales que hereda el formulario original. */
  ngAfterViewInit(): void {
    this.anchor = document.createComment('projection-map-portal');
    this.host.before(this.anchor);
    const style = getComputedStyle(this.host);
    for (const name of ['--hm-bg', '--hm-panel', '--hm-line', '--hm-amber', '--hm-muted', '--hm-green', '--hm-red']) {
      this.host.style.setProperty(name, style.getPropertyValue(name));
    }
    this.host.style.fontFamily = style.fontFamily;
    this.host.style.fontSize = style.fontSize;
    this.sync();
  }

  /** Mantiene el mismo modal dentro de fullscreen y lo devuelve al visor al salir. */
  @HostListener('document:fullscreenchange')
  sync(): void {
    if (!this.anchor) return;
    const target = this.destination ? document.fullscreenElement ?? this.destination : this.anchor.parentElement;
    if (target && this.host.parentElement !== target) target.append(this.host);
  }

  /** El desplazamiento del formulario no propaga gestos de zoom o rotacion al mapa. */
  @HostListener('wheel', ['$event'])
  @HostListener('mousedown', ['$event'])
  @HostListener('dblclick', ['$event'])
  stopMapGesture(event: Event): void { event.stopPropagation(); }

  /** Elimina el nodo trasladado al cerrar su vista; no lo reinserta durante la destruccion. */
  ngOnDestroy(): void {
    this.host.remove();
    this.anchor?.remove();
  }
}
