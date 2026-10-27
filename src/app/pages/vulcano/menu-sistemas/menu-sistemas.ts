import { Component, EventEmitter, Input, Output } from '@angular/core';

/** Identificadores estables; los dos titulos TRABAJOS navegan a destinos distintos. */
export type MenuSistemaId = 'graficar-piezas' | 'ver-piezas' | 'ver-plan' | 'crear-plan' | 'trabajos-crear' | 'trabajos-ver';

/** Metadatos de navegacion; componente es una clave futura, no un selector Angular. */
export interface MenuSistema {
  id: MenuSistemaId;
  titulo: string;
  descripcion: string;
  componente: string;
  activo: boolean;
}

/** Catalogo unico: reorganizar entradas no cambia sus identificadores ni eventos. */
export const MENU_SISTEMAS: readonly Omit<MenuSistema, 'activo'>[] = [
  { id: 'graficar-piezas', titulo: 'GRAFICAR PIEZAS', descripcion: 'Ubicación de piezas', componente: 'graficar-piezas' },
  { id: 'ver-piezas',  titulo: 'VER PIEZAS', descripcion: 'Consulta de piezas', componente: 'ver-piezas' },
  { id: 'ver-plan',  titulo: 'VER PLAN', descripcion: 'Consulta de planes', componente: 'ver-plan' },
  { id: 'crear-plan',  titulo: 'CREAR PLAN', descripcion: 'Preparación de planes', componente: 'crear-plan' },
  { id: 'trabajos-crear',  titulo: 'TRABAJOS', descripcion: 'Área de trabajos 01', componente: 'trabajos-crear' },
  { id: 'trabajos-ver',  titulo: 'GUADAR TRABAJOS', descripcion: 'Área de trabajos 02', componente: 'trabajos-ver' },
];

@Component({
  selector: 'app-menu-sistemas',
  standalone: true,
  templateUrl: './menu-sistemas.html',
  styleUrl: './menu-sistemas.css',
})
export class MenuSistemas {
  /** El padre conserva la seleccion incluso al minimizar y restaurar la ventana. */
  @Input() menuSeleccionado: MenuSistemaId = 'graficar-piezas';

  
  /** Comunica solo la identidad, sin rutas, ventanas adicionales ni datos de negocio. */
  @Output() cambioMenu = new EventEmitter<MenuSistemaId>();

  /** Deriva una sola opcion activa sin duplicar el catalogo. */
  get menu(): MenuSistema[] {
    return MENU_SISTEMAS.map(opcion => ({ ...opcion, activo: opcion.id === this.menuSeleccionado }));
  }

  /** Valida y emite el destino elegido; repetir la seleccion no recrea contenido. */
  seleccionarMenu(id: MenuSistemaId): void {
    if (!MENU_SISTEMAS.some(opcion => opcion.id === id) || id === this.menuSeleccionado) return;
    this.menuSeleccionado = id;
    this.cambioMenu.emit(id);
  }

  /** Flechas/Home/End mueven foco y seleccion; Enter/Espacio usan el click nativo. */
  navegarTeclado(event: KeyboardEvent, index: number): void {
    let destino: number;
    switch (event.key) {
      case 'ArrowRight': destino = (index + 1) % MENU_SISTEMAS.length; break;
      case 'ArrowLeft': destino = (index - 1 + MENU_SISTEMAS.length) % MENU_SISTEMAS.length; break;
      case 'Home': destino = 0; break;
      case 'End': destino = MENU_SISTEMAS.length - 1; break;
      default: return;
    }
    event.preventDefault();
    this.seleccionarMenu(MENU_SISTEMAS[destino].id);
    const botones = (event.currentTarget as HTMLElement).parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
    botones?.[destino].focus();
  }
}
