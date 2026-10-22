import { ApplicationRef, EnvironmentInjector, createComponent } from '@angular/core';
import { MeasurementToolsComponent } from './measurement-tools.component';

/** Monta una unica interfaz Angular dentro del contenedor nativo, incluido fullscreen. */
export function attachMeasurementTools(host: HTMLElement, app: ApplicationRef, injector: EnvironmentInjector, threeDimensional = false): () => void {
  const element = document.createElement('app-measurement-tools');
  const ref = createComponent(MeasurementToolsComponent, { hostElement: element, environmentInjector: injector });
  ref.setInput('threeDimensional', threeDimensional);
  app.attachView(ref.hostView);
  host.append(element);
  ref.changeDetectorRef.detectChanges();
  return () => { app.detachView(ref.hostView); ref.destroy(); element.remove(); };
}
