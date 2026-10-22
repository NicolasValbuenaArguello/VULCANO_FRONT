import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { IconoOtan, IconosService } from '../../../shared/services/iconos.service';

@Component({
  selector: 'app-iconos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './iconos.html',
  styleUrl: './iconos.css',
})
export class Iconos {
  private readonly iconosService = inject(IconosService);

  protected readonly catalogo = this.iconosService.catalogoIconos;
  protected readonly categorias = ['Todas', ...new Set(this.catalogo.map((item) => item.categoria))];

  busqueda = '';
  categoriaSeleccionada = 'Todas';

  get iconosFiltrados(): IconoOtan[] {
    const consulta = this.busqueda.trim().toLowerCase();

    return this.catalogo.filter((icono) => {
      const coincideCategoria =
        this.categoriaSeleccionada === 'Todas' || icono.categoria === this.categoriaSeleccionada;
      const coincideBusqueda =
        !consulta ||
        icono.nombre.toLowerCase().includes(consulta) ||
        icono.categoria.toLowerCase().includes(consulta) ||
        icono.id.toLowerCase().includes(consulta);

      return coincideCategoria && coincideBusqueda;
    });
  }

  seleccionarIcono(icono: IconoOtan): void {
    console.log('[ICONOS] seleccionado:', icono);
    this.iconosService.seleccionarIcono(icono);
  }

  estaSeleccionado(icono: IconoOtan): boolean {
    const seleccionado = this.iconosService.obtenerIconoSeleccionado();
    return !!seleccionado && seleccionado.id === icono.id;
  }
}
