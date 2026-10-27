import { Component, OnDestroy, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Sidebar } from '../pages/sidebar/sidebar';
import { AuthService } from '../core/auth/auth.service';
import { MapaElementosService } from '../shared/services/mapa-elementos.service';
import { IconosService } from '../shared/services/iconos.service';
import { PuntosDemoService } from '../shared/services/puntos-demo.service';
import { MeasurementService } from '../shared/components/geographic-measurement/measurement.service';
import { MapActionsService } from '../shared/components/map-context-menu/map-actions.service';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, Sidebar],
  // La cache demostrativa pertenece a la instancia protegida, nunca al siguiente usuario.
  providers: [PuntosDemoService],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.css',
})
/** Contenedor protegido que registra limpieza privada y aisla la cache demostrativa por instancia. */
export class AppShell implements OnDestroy {
  private readonly auth = inject(AuthService);
  private readonly elements = inject(MapaElementosService);
  private readonly icons = inject(IconosService);
  private readonly measurements = inject(MeasurementService);
  private readonly actions = inject(MapActionsService);
  private readonly unregister = this.auth.registerSessionCleanup(() => this.clearPrivateState());

  /** Reutiliza la limpieza existente sin cambiar herramientas ni servicios operacionales. */
  private clearPrivateState(): void {
    this.actions.close();
    this.measurements.clear();
    this.measurements.updateCursor(null);
    this.elements.limpiarElementos();
    this.icons.limpiarSeleccion();
  }

  /** La salida de la zona protegida destruye sus vistas y su cache de datos demostrativos. */
  ngOnDestroy(): void { this.unregister(); this.clearPrivateState(); }
}
