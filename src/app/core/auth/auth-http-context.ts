import { HttpContextToken } from '@angular/common/http';

export const SKIP_AUTH_INTERCEPTOR = new HttpContextToken<boolean>(() => false);
export const SKIP_ERROR_INTERCEPTOR = new HttpContextToken<boolean>(() => false);

/** Diagnostico temporal, opt-in y solo en desarrollo; nunca contiene credenciales. */
export const GIS_AUTH_DIAGNOSTIC = new HttpContextToken<boolean>(() => false);
