import { HttpContextToken } from '@angular/common/http';

export const SKIP_AUTH_INTERCEPTOR = new HttpContextToken<boolean>(() => false);
export const SKIP_ERROR_INTERCEPTOR = new HttpContextToken<boolean>(() => false);
