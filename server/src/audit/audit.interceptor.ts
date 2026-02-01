// src/audit/audit.interceptor.ts

import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  Logger,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Reflector } from '@nestjs/core';
import { IS_SENSITIVE_KEY } from './audit.decorator';
import { AuditService } from './audit.service';
import type { JwtPayload } from '../auth/jwt-payload.type';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly audit: AuditService,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const httpCtx = context.switchToHttp();
    const req = httpCtx.getRequest<any>();
    const user = req.user as JwtPayload | undefined;

    const method = req.method as string;
    const path: string = req.originalUrl ?? req.url;

    // 1. تحديد العمليات المستهدفة
    // - جميع عمليات التعديل (Write)
    const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

    // 2. Check for @Sensitive decorator
    const sensitiveAnnotation = this.reflector.getAllAndOverride<string | boolean>(
      IS_SENSITIVE_KEY,
      [context.getHandler(), context.getClass()],
    );

    const isSensitiveRead = method === 'GET' && !!sensitiveAnnotation;

    // إذا لم تكن عملية مهمة، مررها دون تسجيل
    if (!isMutation && !isSensitiveRead) {
      return next.handle();
    }

    const start = Date.now();

    return next.handle().pipe(
      tap(async (responseBody) => {
        const duration = Date.now() - start;

        // 2. استنتاج الكيان والـ ID
        const { entity, entityId } = this.inferEntityAndId(path, req);

        // 3. تحديد نوع الحدث
        let actionName = `${method} ${path.split('?')[0]}`;
        if (isSensitiveRead && typeof sensitiveAnnotation === 'string') {
          actionName = sensitiveAnnotation;
        } else if (isSensitiveRead) {
           actionName = `VIEW_SENSITIVE_DATA`;
        }

        // 4. تسجيل العملية
        try {
          await this.audit.log({
            hospitalId: user?.hospitalId ?? null,
            userId: user?.sub ?? null,
            action: actionName,
            entity: entity,
            entityId: entityId,
            ipAddress: req.ip || req.connection?.remoteAddress,
            clientName: req.headers['user-agent'], // أو x-client-name
            details: {
              method,
              path,
              params: req.params,
              query: req.query,
              statusCode: context.switchToHttp().getResponse().statusCode,
              durationMs: duration,
              // في القراءة لا نسجل الـ Body، في الكتابة نسجل ما تم إرساله (بحذر)
              body: isMutation ? this.sanitizeBody(req.body) : undefined,
            },
          });
        } catch (err) {
          this.logger.error('Failed to log audit', err);
        }
      }),
    );
  }

  // استنتاج الكيان (مثلاً patients) والـ ID من الرابط
  private inferEntityAndId(path: string, req: any) {
    const cleanPath = path.split('?')[0];
    const segments = cleanPath.split('/').filter(Boolean);

    // عادةً أول جزء هو الكيان (patients, encounters...)
    const entity = segments[0] || 'Unknown';

    // محاولة العثور على ID
    let id: number | null = null;

    // 1. من الـ Params
    if (req.params?.id) id = Number(req.params.id);
    else if (req.params?.patientId) id = Number(req.params.patientId);
    else if (req.params?.encounterId) id = Number(req.params.encounterId);

    // 2. من الرابط مباشرة إذا لم يوجد في الـ params
    if (!id) {
      const lastSeg = segments[segments.length - 1];
      if (!isNaN(Number(lastSeg))) id = Number(lastSeg);
    }

    return { entity, entityId: id };
  }

  // تنظيف البيانات الحساسة من الـ Body قبل التسجيل
  private sanitizeBody(body: any) {
    if (!body) return null;
    const copy = { ...body };
    if (copy.password) copy.password = '***';
    if (copy.token) copy.token = '***';
    return copy;
  }
}

// // src/audit/audit.interceptor.ts

// import {
//   CallHandler,
//   ExecutionContext,
//   Injectable,
//   NestInterceptor,
// } from '@nestjs/common';
// import { Observable, tap } from 'rxjs';
// import { AuditService } from './audit.service';
// import type { JwtPayload } from '../auth/jwt-payload.type';

// @Injectable()
// export class AuditInterceptor implements NestInterceptor {
//   constructor(private readonly audit: AuditService) {}

//   intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
//     const httpCtx = context.switchToHttp();
//     const req = httpCtx.getRequest<any>();

//     const method = req.method as string;
//     const path: string = req.originalUrl ?? req.url;

//     // 🛡️ تحديد هل هذه العملية تستحق التسجيل في سجل التدقيق؟
//     const isMutation = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);

//     // 🔍 فحص "مراقبة الخصوصية": هل الطبيب/الممرض يطلع على ملف حالة طبية (EMR)؟
//     // نصطاد مسار /encounters/:id عندما يكون GET
//     const isEMRView = method === 'GET' && /^\/encounters\/\d+$/.test(path);

//     // إذا لم تكن عملية تغيير بيانات ولا عملية اطلاع على EMR، نتجاهل التسجيل لتوفير مساحة قاعدة البيانات
//     if (!isMutation && !isEMRView) {
//       return next.handle();
//     }

//     const user = req.user as JwtPayload | undefined;
//     const start = Date.now();

//     return next.handle().pipe(
//       tap(async (responseBody) => {
//         // تحديد نوع الحركة للسجل
//         let actionName = `${method} ${path}`;
//         if (isEMRView) {
//           actionName = `VIEW_EMR_DETAILS`; // تسمية احترافية لعملية الاطلاع
//         }

//         const rawIp =
//           (req.headers['x-forwarded-for'] as string | undefined)
//             ?.split(',')[0]
//             ?.trim() ||
//           req.ip ||
//           req.connection?.remoteAddress ||
//           req.socket?.remoteAddress;

//         const ip =
//           rawIp === '::1' || rawIp === '::ffff:127.0.0.1' ? '127.0.0.1' : rawIp;

//         const clientName =
//           (req.headers['x-client-name'] as string | undefined) ?? 'WEB_PORTAL';

//         const { entity, entityId } = this.inferEntityAndId(path, req);

//         // تسجيل الحركة في قاعدة البيانات
//         await this.audit.log({
//           hospitalId: user?.hospitalId ?? null,
//           userId: user?.sub ?? null,
//           action: actionName,
//           entity: entity || (isEMRView ? 'Encounter' : null),
//           entityId,
//           ipAddress: ip ?? null,
//           clientName: clientName ?? null,
//           details: {
//             durationMs: Date.now() - start,
//             // لا نسجل الـ Body في الـ GET (View) لحماية الخصوصية ومنع الضخامة، نسجله فقط في الـ Mutations
//             body: isMutation ? req.body : undefined,
//             params: req.params,
//             query: req.query,
//             status: 'SUCCESS',
//           },
//         });
//       }),
//     );
//   }

//   private inferEntityAndId(
//     path: string,
//     req: any,
//   ): {
//     entity?: string | null;
//     entityId?: number | null;
//   } {
//     const cleanPath = path.split('?')[0];
//     const segments = cleanPath.split('/').filter(Boolean);

//     if (!segments.length) return {};

//     const entity = segments[0];
//     let id: number | null = null;

//     const candidate =
//       req.params?.id ?? req.params?.patientId ?? req.params?.encounterId;

//     if (candidate) {
//       const n = Number(candidate);
//       if (!Number.isNaN(n)) id = n;
//     } else {
//       const last = segments[segments.length - 1];
//       const n = Number(last);
//       if (!Number.isNaN(n)) id = n;
//     }

//     return { entity, entityId: id };
//   }
// }
