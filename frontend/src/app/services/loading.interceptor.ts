import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { finalize } from 'rxjs';
import { LoadingService } from './loading.service';

export const loadingInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.url.startsWith('/assets/')) return next(req);
  const loading = inject(LoadingService);
  loading.increment();
  return next(req).pipe(finalize(() => loading.decrement()));
};
