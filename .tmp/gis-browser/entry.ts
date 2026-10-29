import '@angular/compiler';
import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import * as ML from 'maplibre-gl';
import { GisPoligonos } from '../../src/app/pages/gis-poligonos/gis-poligonos';
import '../../node_modules/leaflet/dist/leaflet.css';
import '../../node_modules/maplibre-gl/dist/maplibre-gl.css';
ML.setWorkerUrl('/gis-preview/worker.js');
bootstrapApplication(GisPoligonos, {providers:[provideHttpClient()]}).then(async (app) => {
 const visor = app.components[0].instance as any;
 for(let i=0;i<100;i++) {
  if(document.querySelector('.maplibregl-marker'))break;
  await new Promise(r=>setTimeout(r,100));
 }
 const centrar=[...document.querySelectorAll('button')].find(b=>b.textContent?.trim()==='CENTRAR');
 centrar?.click();
 for(let i=0;i<100;i++){visor.mapa3?.triggerRepaint(); if(visor.mapa3?.queryRenderedFeatures({layers:['rellenos']}).length)break;await new Promise(r=>setTimeout(r,100));}
 await new Promise(r=>setTimeout(r,500));
 const resultado={poligonos3d:visor.mapa3?.queryRenderedFeatures({layers:['rellenos']}).length, fuenteCargada:visor.mapa3?.isSourceLoaded('poligonos'), nombre:document.body.textContent?.includes('Poligono de prueba'),
 leaflet:document.querySelectorAll('.leaflet-overlay-pane svg path').length,
 canvas3d:document.querySelectorAll('.maplibregl-canvas').length,
 etiquetas3d:document.querySelectorAll('.maplibregl-marker').length,
 estado:document.querySelector('[role="status"]')?.textContent};
 const out=document.createElement('pre');out.id='browser-result';out.textContent=JSON.stringify(resultado);document.body.append(out);
}).catch(error=>{document.body.setAttribute('data-error',error.message)});
