// src/common/filters/http-exception.filter.ts

import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionsHandler');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'حدث خطأ غير متوقع في الخادم.';

    // ✅ التعديل هنا: السماح للمتغير بقبول نص أو قيمة فارغة
    let errorDetails: string | null = null;

    // 1. معالجة أخطاء NestJS القياسية
    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res: any = exception.getResponse();
      if (typeof res === 'string') {
        message = res;
      } else if (typeof res === 'object' && res.message) {
        message = Array.isArray(res.message)
          ? res.message.join('، ')
          : res.message;
      }
    }
    // 2. معالجة أخطاء Prisma (قاعدة البيانات)
    else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      switch (exception.code) {
        case 'P2002': // Unique Constraint Violation
          status = HttpStatus.CONFLICT;
          const target = (exception.meta?.target as string[]) || [];
          message = `هذا السجل موجود مسبقاً (تكرار في الحقل: ${target.join(', ')})`;
          break;
        case 'P2025': // Record not found
          status = HttpStatus.NOT_FOUND;
          message = 'السجل المطلوب غير موجود أو تم حذفه.';
          break;
        case 'P2003': // Foreign Key Violation
          status = HttpStatus.BAD_REQUEST;
          message = 'لا يمكن إتمام العملية لارتباط هذا السجل ببيانات أخرى.';
          break;
        default:
          status = HttpStatus.BAD_REQUEST;
          message = `خطأ في قاعدة البيانات: ${exception.code}`;
          break;
      }
    }
    // 3. معالجة أخطاء Prisma Validation
    else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      message = 'بيانات الإدخال غير صالحة لهيكلية قاعدة البيانات.';
      errorDetails = exception.message; // للتطوير فقط
    }

    // تسجيل الخطأ
    if (status >= 500) {
      this.logger.error(
        `[${request.method}] ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    } else {
      this.logger.warn(`[${request.method}] ${request.url} >> ${message}`);
    }

    // الرد الموحد
    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
      path: request.url,
      // يمكن عرض التفاصيل فقط في بيئة التطوير
      // errorDetails: process.env.NODE_ENV !== 'production' ? errorDetails : undefined,
    });
  }
}
