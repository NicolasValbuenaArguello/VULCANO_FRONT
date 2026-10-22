import { bootstrapApplication } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { PointsComponent } from './points.component';

bootstrapApplication(PointsComponent, { providers: [provideHttpClient()] }).catch(console.error);
