import { HttpContextToken, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { defer, finalize } from 'rxjs';
import { LoaderService } from '../services/loader.service';

export const LOADER_OPERATION = new HttpContextToken<string | null>(() => null);

export const loaderInterceptor: HttpInterceptorFn = (request, next) => {
  const loader = inject(LoaderService);
  const name = request.context.get(LOADER_OPERATION);
  if (!name) return next(request);
  return defer(() => {
    const release = loader.acquire(name);
    return defer(() => next(request)).pipe(finalize(release));
  });
};
