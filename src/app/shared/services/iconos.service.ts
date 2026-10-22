import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface IconoOtan {
  id: string;
  nombre: string;
  categoria: string;
  url: string;
  tipo: string;
}

export interface IconoSeleccionado {
  id: string;
  nombre: string;
  categoria: string;
  url: string;
  tipo: string;
  origen: 'catalogo' | 'archivo';
  archivo: File | null;
}

@Injectable({
  providedIn: 'root',
})
export class IconosService {
  private readonly seleccionSubject = new BehaviorSubject<IconoSeleccionado | null>(null);

  readonly iconoSeleccionado$ = this.seleccionSubject.asObservable();

  readonly catalogoIconos: IconoOtan[] = [
    { id: 'ac', nombre: 'AC', categoria: 'Unidad', url: this.asset('AC.png'), tipo: 'image/png' },
    { id: 'alta_montana', nombre: 'Alta montaña', categoria: 'Unidad', url: this.asset('ALTA MONTAÑA.png'), tipo: 'image/png' },
    { id: 'art', nombre: 'ART', categoria: 'Unidad', url: this.asset('ART.png'), tipo: 'image/png' },
    { id: 'aspc', nombre: 'ASPC', categoria: 'Unidad', url: this.asset('ASPC.png'), tipo: 'image/png' },
    { id: 'avi', nombre: 'AVI', categoria: 'Unidad', url: this.asset('AVI.png'), tipo: 'image/png' },
    { id: 'baeev', nombre: 'BAEEV', categoria: 'Unidad', url: this.asset('BAEEV.png'), tipo: 'image/png' },
    { id: 'bas', nombre: 'BAS', categoria: 'Unidad', url: this.asset('BAS.png'), tipo: 'image/png' },
    { id: 'batot', nombre: 'BATOT', categoria: 'Unidad', url: this.asset('BATOT.png'), tipo: 'image/png' },
    { id: 'biter', nombre: 'BITER', categoria: 'Unidad', url: this.asset('BITER.png'), tipo: 'image/png' },
    { id: 'cab', nombre: 'CAB', categoria: 'Unidad', url: this.asset('CAB.png'), tipo: 'image/png' },
    { id: 'com', nombre: 'COM', categoria: 'Unidad', url: this.asset('COM.png'), tipo: 'image/png' },
    { id: 'fe', nombre: 'FE', categoria: 'Unidad', url: this.asset('FE.png'), tipo: 'image/png' },
    { id: 'gaula', nombre: 'GAULA', categoria: 'Unidad', url: this.asset('GAULA.png'), tipo: 'image/png' },
    { id: 'inf', nombre: 'INF', categoria: 'Unidad', url: this.asset('INF.png'), tipo: 'image/png' },
    { id: 'ing', nombre: 'ING', categoria: 'Unidad', url: this.asset('ING.png'), tipo: 'image/png' },
    { id: 'log', nombre: 'LOG', categoria: 'Unidad', url: this.asset('LOG.png'), tipo: 'image/png' },
    { id: 'nar', nombre: 'NAR', categoria: 'Unidad', url: this.asset('NAR.png'), tipo: 'image/png' },
    { id: 'no_reporta', nombre: 'No reporta', categoria: 'Estado', url: this.asset('NO REPORTA.png'), tipo: 'image/png' },
    { id: 'pm', nombre: 'PM', categoria: 'Unidad', url: this.asset('PM.png'), tipo: 'image/png' },
    { id: 'selva', nombre: 'Selva', categoria: 'Unidad', url: this.asset('SELVA.png'), tipo: 'image/png' },
    { id: 'pr_rojo', nombre: 'PR_ROJO', categoria: 'Estado', url: this.asset('PR_ROJO.png'), tipo: 'image/png' },
     { id: 'pr_negro', nombre: 'PR_NEGRO', categoria: 'Estado', url: this.asset('PR_NEGRO.png'), tipo: 'image/png' },
  ];

  seleccionarIcono(icono: IconoOtan | IconoSeleccionado): void {
    this.seleccionSubject.next({
      id: icono.id,
      nombre: icono.nombre,
      categoria: icono.categoria,
      url: icono.url,
      tipo: icono.tipo,
      origen: 'catalogo',
      archivo: null,
    });
  }

  seleccionarIconoArchivo(icono: {
    id: string;
    nombre: string;
    categoria: string;
    url: string;
    tipo: string;
    archivo: File;
  }): void {
    this.seleccionSubject.next({
      id: icono.id,
      nombre: icono.nombre,
      categoria: icono.categoria,
      url: icono.url,
      tipo: icono.tipo,
      origen: 'archivo',
      archivo: icono.archivo,
    });
  }

  limpiarSeleccion(): void {
    this.seleccionSubject.next(null);
  }

  obtenerIconoSeleccionado(): IconoSeleccionado | null {
    return this.seleccionSubject.value;
  }

  private asset(nombreArchivo: string): string {
    return `/assets/unidades/${encodeURIComponent(nombreArchivo)}`;
  }
}
