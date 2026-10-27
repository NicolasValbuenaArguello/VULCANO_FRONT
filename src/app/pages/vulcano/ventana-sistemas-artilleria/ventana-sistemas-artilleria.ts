import { Component } from '@angular/core';
import { FloatingWindowBase } from '../../../shared/components/window-workspace/floating-window-base';
import { WindowManagerService } from '../../../shared/components/window-workspace/window-manager.service';
import { MENU_SISTEMAS, MenuSistemaId, MenuSistemas } from '../menu-sistemas/menu-sistemas';
// Componente existente: se integra sin agregar rutas ni funcionalidad de negocio.
import { Piezas } from '../pages_sistemas/piezas/piezas';
import {VerPiezas} from '../pages_sistemas/ver-piezas/ver-piezas'
import {VerPlanes} from '../pages_sistemas/ver-planes/ver-planes'
import {CrearPlanes} from '../pages_sistemas/crear-planes/crear-planes'
import {CrearTrabajos} from '../pages_sistemas/crear-trabajos/crear-trabajos'
import {VerTrabajos} from '../pages_sistemas/ver-trabajos/ver-trabajos'


/** Ventana de presentacion con navegacion local entre componentes standalone. */
@Component({
  selector: 'app-ventana-sistemas-artilleria',
  standalone: true,
  providers: [WindowManagerService],
  templateUrl: './ventana-sistemas-artilleria.html',
  styleUrls: ['../menu/menu.css', './ventana-sistemas-artilleria.css'],
  imports: [MenuSistemas, Piezas, VerPiezas, VerPlanes, CrearPlanes, CrearTrabajos, VerTrabajos],
})
export class VentanaSistemasArtilleria extends FloatingWindowBase {
  /** Destino conservado por la ventana; independiente de su geometria y visibilidad. */
  componenteActivo: MenuSistemaId = 'graficar-piezas';

  /** Metadatos del destino actual para el panel provisional accesible. */
  get opcionActiva() { return MENU_SISTEMAS.find(opcion => opcion.id === this.componenteActivo)!; }

  /** Recibe el evento del menu sin navegar ni reconstruir la ventana. */
cambiarComponente(id: MenuSistemaId): void {
  if (MENU_SISTEMAS.some(opcion => opcion.id === id)) {
    this.componenteActivo = id;
  }
}

  // Integracion futura: importar el standalone y agregar su @case antes del @default.
  // Si corresponde, envolver el componente en @defer dentro del caso seleccionado.
  constructor() { super('sistemas-artilleria', 'SISTEMAS DE ARTILLERÍA'); }
}
