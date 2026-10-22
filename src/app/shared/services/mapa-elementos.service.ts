import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ElementoMapa } from '../models/elemento-mapa.model';

@Injectable({
  providedIn: 'root',
})
export class MapaElementosService {
  private readonly elementosSubject = new BehaviorSubject<ElementoMapa[]>([]);

  readonly elementos$ = this.elementosSubject.asObservable();

  agregarElemento(elemento: ElementoMapa): ElementoMapa {
    const persistido = this.normalizarElemento(elemento);
    const elementosActuales = this.elementosSubject.value;
    const siguientes = elementosActuales.filter((item) => item.idTemporal !== persistido.idTemporal);

    this.elementosSubject.next([...siguientes, persistido]);
    return persistido;
  }

  actualizarElemento(id: string, cambios: Partial<ElementoMapa>): void {
    const elementosActuales = this.elementosSubject.value;
    const siguientes = elementosActuales.map((item) => {
      if (item.idTemporal !== id) {
        return item;
      }

      this.liberarRecursosParciales(item, cambios);
      return this.normalizarElemento({
        ...item,
        ...cambios,
        idTemporal: item.idTemporal,
        fechaCreacion: item.fechaCreacion,
      });
    });

    this.elementosSubject.next(siguientes);
  }

  eliminarElemento(id: string): void {
    const elementosActuales = this.elementosSubject.value;
    const elemento = elementosActuales.find((item) => item.idTemporal === id);

    if (elemento) {
      this.liberarRecursos(elemento);
    }

    this.elementosSubject.next(elementosActuales.filter((item) => item.idTemporal !== id));
  }

  obtenerElementos(): ElementoMapa[] {
    return [...this.elementosSubject.value];
  }

  limpiarElementos(): void {
    for (const elemento of this.elementosSubject.value) {
      this.liberarRecursos(elemento);
    }

    this.elementosSubject.next([]);
  }

  private normalizarElemento(elemento: ElementoMapa): ElementoMapa {
    const icono = elemento.icono ?? null;
    const imagen = elemento.imagen ?? this.crearPreviewDesdeArchivo(elemento.archivoImagen) ?? null;

    return {
      ...elemento,
      icono,
      imagen,
    };
  }

  private crearPreviewDesdeArchivo(archivo: File | null | undefined): string | null {
    if (!archivo || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
      return null;
    }

    return URL.createObjectURL(archivo);
  }

  private liberarRecursosParciales(
    elemento: ElementoMapa,
    cambios: Partial<ElementoMapa>,
  ): void {
    if (cambios.archivoIcono && elemento.icono) {
      this.liberarUrl(elemento.icono);
    }

    if (cambios.archivoImagen && elemento.imagen) {
      this.liberarUrl(elemento.imagen);
    }
  }

  private liberarRecursos(elemento: ElementoMapa): void {
    if (elemento.icono) {
      this.liberarUrl(elemento.icono);
    }

    if (elemento.imagen) {
      this.liberarUrl(elemento.imagen);
    }
  }

  private liberarUrl(url: string): void {
    if (typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') {
      return;
    }

    if (url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  }
}
