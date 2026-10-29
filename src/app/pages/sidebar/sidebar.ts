import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  HostListener,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { APP_PATHS } from '../../core/constants/routes.constants';

export interface MenuItem {
  name: string;
  route?: string;
  permiso?: boolean;
  permisoCodigo?: string;
  children?: MenuItem[];
  icon?: string;
  expanded?: boolean;
}

// ======================================================
// CONFIGURACION DEL MENU
// ======================================================
// Menú superior reutilizable basado en menuItems.
// Los permisos están preparados para reemplazarse por datos del backend.
// ======================================================

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './sidebar.html',
  styleUrls: ['./sidebar.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class Sidebar {
  private readonly hostRef = inject(ElementRef<HTMLElement>);
  readonly authService = inject(AuthService);

  menuItems: MenuItem[] = [
    {
      name: 'Home',
      route: APP_PATHS.HOME,
      permiso: true,
      permisoCodigo: 'HOME_VER',
    },
    {
      name: 'Usuario',
      permiso: true,
      permisoCodigo: 'USUARIO_MENU',
      children: [
        {
          name: 'Ingreso',
          route: APP_PATHS.INGRESO,
          permiso: true,
          permisoCodigo: 'USUARIO_INGRESAR',
        },
        {
          name: 'Listado',
          route: APP_PATHS.PERMISOS,
          permiso: true,
          permisoCodigo: 'USUARIO_LISTAR',
        },
      ],
    },
    {
      name: 'Vulcano',
      permiso: true,
      permisoCodigo: 'VULCANO_VER',
      children: [
                {
          name: 'Operaciones',
          route: APP_PATHS.VULCANO,
          permiso: true,
          permisoCodigo: 'VULCANO_OPERACIONES',
        },
                        {
          name: 'Logistica',
          route: APP_PATHS.VULCANOLOG,
          permiso: true,
          permisoCodigo: 'VULCANO_LOGISTICO',
        },
      ]
    },

  ];

  
  mobileMenuOpen = false;
  openMenu: string | null = null;

  // ======================================================
  // DROPDOWNS
  // ======================================================

  toggleDropdown(name: string): void {
    this.openMenu = this.openMenu === name ? null : name;
  }

  closeMenus(): void {
    this.openMenu = null;
    this.mobileMenuOpen = false;
  }

  isDropdownOpen(name: string): boolean {
    return this.openMenu === name;
  }

  onDropdownTriggerKeydown(event: KeyboardEvent, item: MenuItem): void {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      this.toggleDropdown(item.name);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!this.isDropdownOpen(item.name)) {
        this.openMenu = item.name;
      }
    }

    if (event.key === 'Escape') {
      this.closeMenus();
    }
  }

  onDropdownLinkClick(): void {
    this.closeMenus();
  }

  // ======================================================
  // RESPONSIVE / MOBILE
  // ======================================================

  toggleMobileMenu(): void {
    this.mobileMenuOpen = !this.mobileMenuOpen;
    if (!this.mobileMenuOpen) {
      this.openMenu = null;
    }
  }

  onMobileNavigate(): void {
    this.mobileMenuOpen = false;
    this.openMenu = null;
  }

  /** Cierra menus y solicita el cierre centralizado, tambien desde teclado. */
  logout(): void {
    this.closeMenus();
    void this.authService.logout();
  }

  // ======================================================
  // PERMISOS
  // ======================================================

  /** @param item Configuracion estatica del menu.
   * @returns Visibilidad por booleano permiso; permisoCodigo aun no se consulta contra AuthService. */
  canShowItem(item: MenuItem): boolean {
    return item.permiso !== false;
  }

  getVisibleChildren(item: MenuItem): MenuItem[] {
    return (item.children ?? []).filter((child) => this.canShowItem(child));
  }

  hasVisibleChildren(item: MenuItem): boolean {
    return this.getVisibleChildren(item).length > 0;
  }

  // ======================================================
  // ACCESIBILIDAD / CICLO DE VIDA
  // ======================================================

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent): void {
    if (!this.hostRef.nativeElement.contains(event.target as Node)) {
      this.closeMenus();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.closeMenus();
  }
}
