import { Injectable, signal } from '@angular/core';
import { CatalogosLogin, UnidadMilitar } from './auth.models';
export interface NodoUnidad { unidad: UnidadMilitar; subordinadas: NodoUnidad[]; }
/** Catalogos de la sesion, sin consultas HTTP ni persistencia. */
@Injectable({ providedIn: 'root' })
export class CatalogosService {
  private readonly estado = signal<CatalogosLogin | null>(null);
  readonly catalogos = this.estado.asReadonly();
  /** @param catalogos Datos ya validados del bootstrap; se copian para aislar la respuesta HTTP.
   * @throws Si structuredClone no puede copiar los datos recibidos. */
  cargar(catalogos: CatalogosLogin): void { this.estado.set(structuredClone(catalogos)); }
  /** Elimina los catalogos de la sesion al salir, expirar o fallar la autenticacion. */
  limpiar(): void { this.estado.set(null); }
  private unidades(): UnidadMilitar[] { return this.estado()?.unidades ?? []; }
  /** @returns Unidades cuyo unidad_padre_id es null. */
  obtenerPrincipales(): UnidadMilitar[] { return this.unidades().filter(u => u.unidad_padre_id === null); }
  /** @param id ID de la unidad superior.
   * @returns Hijas directas segun unidad_padre_id, sin inferir jerarquia del codigo. */
  obtenerSubordinadas(id: number): UnidadMilitar[] { return this.unidades().filter(u => u.unidad_padre_id === id); }
  /** @param id ID de unidad.
   * @returns Unidad encontrada o undefined. */
  buscarPorId(id: number): UnidadMilitar | undefined { return this.unidades().find(u => u.id === id); }
  /** @param codigo Codigo exacto de unidad.
   * @returns Primera coincidencia o undefined. */
  buscarPorCodigo(codigo: string): UnidadMilitar | undefined { return this.unidades().find(u => u.codigo === codigo); }
  /** @param id ID de la unidad subordinada.
   * @returns Padre encontrado o undefined para raices, huerfanas o IDs ausentes. */
  obtenerSuperior(id: number): UnidadMilitar | undefined {
    const padre = this.buscarPorId(id)?.unidad_padre_id;
    return padre == null ? undefined : this.buscarPorId(padre);
  }
  /** Detiene ciclos y conserva las unidades huerfanas como raices del arbol. */
  /** @returns Bosque con unidades, subordinadas y corte de ciclos; no corrige datos del backend. */
  construirJerarquia(): NodoUnidad[] {
    const vistos = new Set<number>();
    const visitar = (unidad: UnidadMilitar): NodoUnidad => {
      vistos.add(unidad.id);
      return { unidad, subordinadas: this.obtenerSubordinadas(unidad.id)
        .filter(u => !vistos.has(u.id)).map(visitar) };
    };
    const raices = this.unidades().filter(u => u.unidad_padre_id === null || !this.buscarPorId(u.unidad_padre_id));
    const arbol = raices.map(visitar);
    for (const u of this.unidades()) if (!vistos.has(u.id)) arbol.push(visitar(u));
    return arbol;
  }
  /** @param id ID de la unidad destino.
   * @returns Ruta de superior a subordinada, detenida ante padre ausente o repetido. */
  obtenerRuta(id: number): UnidadMilitar[] {
    const ruta: UnidadMilitar[] = [], vistos = new Set<number>();
    let unidad = this.buscarPorId(id);
    while (unidad && !vistos.has(unidad.id)) {
      vistos.add(unidad.id); ruta.unshift(unidad); unidad = this.obtenerSuperior(unidad.id);
    }
    return ruta;
  }
}
