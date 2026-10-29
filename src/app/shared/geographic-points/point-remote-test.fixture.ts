import { inject, signal } from '@angular/core';
import { PointRemoteService } from './point-remote.service';
import { GeographicPointsService } from './geographic-points';
import { PointInput } from './point-api.service';

/** Aisla transporte en pruebas de dibujo; las pruebas HTTP usan el coordinador real. */
export const localPointRemoteFixture = {
  provide: PointRemoteService,
  useFactory: () => {
    const state = inject(GeographicPointsService);
    return { ocupado: signal(false), operacion: signal(null), cargado: signal(true), error: signal(null), creacionPendiente: signal(false),
      cargar: async () => {}, comprobarCreacion: async () => null,
      guardar: async (input: PointInput, id: string | null) => state.guardar(input, id),
      eliminar: async (id: string) => state.eliminar(id) };
  },
};
