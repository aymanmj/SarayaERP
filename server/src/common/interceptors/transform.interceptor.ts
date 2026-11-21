// src/common/interceptors/transform.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import type { Request, Response as ExpressResponse } from 'express';
import { isRadiologyViewerPath } from '../utils/request-log-path';

export interface Response<T> {
  success: boolean;
  data: T;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, Response<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<Response<T>> {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const requestUrl = request.originalUrl || request.url || '';

    // 📊 Bypass transformation for Prometheus metrics
    if (requestUrl.includes('/metrics')) {
      return next.handle();
    }

    if (
      requestUrl.startsWith('/api/fhir') ||
      isRadiologyViewerPath(requestUrl)
    ) {
      return next.handle();
    }

    return next.handle().pipe(
      map((data) => ({
        success: true,
        statusCode: http.getResponse<ExpressResponse>().statusCode,
        data: data || null, // لضمان عدم إرجاع undefined
      })),
    );
  }
}
