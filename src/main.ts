import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

void import('maplibre-gl')
  .then((maplibreModule) => {
    const maplibre = (maplibreModule as typeof import('maplibre-gl') & {
      default?: typeof import('maplibre-gl');
    }).default ?? maplibreModule;
    const maplibreWorkerUrl = new URL(
      'maplibre-gl-csp-worker.js',
      document.baseURI
    ).href;

    maplibre.setWorkerUrl?.(maplibreWorkerUrl);
    maplibre.setWorkerCount?.(2);
    maplibre.setMaxParallelImageRequests?.(24);

    return bootstrapApplication(App, appConfig);
  })
  .catch((err) => console.error(err));
