/** Encabezado compartido por los controles nativos de Leaflet y MapLibre. */
export function createMapLayersHeader(): HTMLElement {
  const header = document.createElement('header');
  header.className = 'map-layers-heading';
  const title = document.createElement('strong');
  title.textContent = 'MAPAS Y CAPAS';
  const subtitle = document.createElement('small');
  subtitle.textContent = 'Configuraci?n de visualizaci?n';
  const section = document.createElement('div');
  section.className = 'map-layers-section';
  section.textContent = 'MAPA BASE';
  header.append(title, subtitle, section);
  return header;
}

/** Icono vectorial local, sin dependencias ni solicitudes externas. */
export const MAP_LAYERS_ICON = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 10 5-10 5L2 8Z M2 12l10 5 10-5 M2 16l10 5 10-5"/></svg>';

/** Limita el panel al espacio del visor y libera la observacion al retirar el control. */
export function observeMapLayersViewport(control: HTMLElement, viewport: HTMLElement): () => void {
  const update = () => {
    const bounds = viewport.getBoundingClientRect();
    const button = control.getBoundingClientRect();
    const height = bounds.height || window.innerHeight;
    const width = bounds.width || window.innerWidth;
    control.style.setProperty('--layers-available-height', `${Math.max(80, height - Math.max(0, button.top - bounds.top) - 54)}px`);
    control.style.setProperty('--layers-available-width', `${Math.max(100, width - 24)}px`);
  };
  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
  observer?.observe(viewport);
  window.addEventListener('resize', update);
  update();
  return () => { observer?.disconnect(); window.removeEventListener('resize', update); };
}
