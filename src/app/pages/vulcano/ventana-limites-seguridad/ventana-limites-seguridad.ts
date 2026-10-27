import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';
import { FloatingWindowBase } from '../../../shared/components/window-workspace/floating-window-base';
import { WindowManagerService } from '../../../shared/components/window-workspace/window-manager.service';

/** Presentacion unica compartida por ambos menus; no contiene logica operacional. */
@Component({
  selector: 'app-ventana-limites-seguridad', standalone: true,
  providers: [WindowManagerService],
  templateUrl: './ventana-limites-seguridad.html',
  styleUrls: ['../menu/menu.css', '../ventana-sistemas-artilleria/ventana-sistemas-artilleria.css', './ventana-limites-seguridad.css'],
})
export class VentanaLimitesSeguridad extends FloatingWindowBase implements AfterViewInit {
  @ViewChild('dialog', { static: true }) private dialog!: ElementRef<HTMLElement>;

  /** Registra la identidad y el tamano inicial dentro de los limites del viewport. */
  constructor() { super('limites-seguridad', 'LÍMITES DE SEGURIDAD', 850, 550); }

  ngAfterViewInit(): void { this.focusWindow(); }

  /** Devuelve el foco al dialogo al abrir o restaurar, sin desplazar el mapa. */
  focusWindow(): void { this.dialog.nativeElement.focus({ preventScroll: true }); }
}
