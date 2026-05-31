// src/common/interceptors/localization.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { BYPASS_LOCALIZATION_KEY } from '../decorators/bypass-localization.decorator';

/**
 * واجهة اعتراضية لتعريب البيانات تلقائياً بناءً على ترويسة Accept-Language.
 * تقوم بفحص الاستجابة العائدة وتدمج الحقول ثنائية اللغة (مثل nameAr/nameEn) في حقل واحد.
 */
@Injectable()
export class LocalizationInterceptor implements NestInterceptor {
  constructor(private reflector?: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    if (this.reflector) {
      const isBypassed = this.reflector.getAllAndOverride<boolean>(
        BYPASS_LOCALIZATION_KEY,
        [context.getHandler(), context.getClass()],
      );
      if (isBypassed) {
        return next.handle();
      }
    }

    const request = context.switchToHttp().getRequest();
    const bypassHeader = request.headers['x-bypass-localization'] === 'true';
    const bypassQuery = request.query?.bypassLocalize === 'true';

    if (bypassHeader || bypassQuery) {
      return next.handle();
    }

    const acceptLanguage = request.headers['accept-language'] || 'ar';
    const lang = acceptLanguage.toLowerCase().startsWith('en') ? 'en' : 'ar';

    return next.handle().pipe(
      map((data) => {
        if (!data) return data;
        return this.localize(data, lang);
      }),
    );
  }

  private localize(data: any, lang: 'ar' | 'en'): any {
    if (Array.isArray(data)) {
      return data.map((item) => this.localize(item, lang));
    }

    if (data !== null && typeof data === 'object') {
      // الحفاظ على كائنات التواريخ والتعابير النمطية والكسور العشرية دون تعديل
      if (
        data instanceof Date ||
        data instanceof RegExp ||
        (data.constructor && data.constructor.name === 'Decimal')
      ) {
        return data;
      }

      const localizedObj: any = {};
      const keys = Object.keys(data);

      // تحديد جميع المفاتيح الأساسية التي تمتلك لاحقات ثنائية اللغة
      const baseKeys = new Set<string>();
      for (const key of keys) {
        if (key.endsWith('Ar')) {
          baseKeys.add(key.slice(0, -2));
        } else if (key.endsWith('En')) {
          baseKeys.add(key.slice(0, -2));
        }
      }

      for (const key of keys) {
        // تجاوز مفاتيح اللغات المفصلة لأنها ستدمج في المفتاح الأساسي
        if (key.endsWith('Ar') || key.endsWith('En')) {
          continue;
        }

        if (baseKeys.has(key)) {
          const keyAr = `${key}Ar`;
          const keyEn = `${key}En`;

          const valAr = data[keyAr];
          const valEn = data[keyEn];
          const valDefault = data[key];

          if (lang === 'ar') {
            localizedObj[key] = this.localize(
              valAr !== undefined && valAr !== null
                ? valAr
                : (valDefault ?? valEn),
              lang,
            );
          } else {
            localizedObj[key] = this.localize(
              valEn !== undefined && valEn !== null
                ? valEn
                : (valDefault ?? valAr),
              lang,
            );
          }
        } else {
          localizedObj[key] = this.localize(data[key], lang);
        }
      }

      // معالجة الحالات التي لا يوجد فيها مفتاح أساسي افتراضي في الكائن الأصلي
      // مثل: { titleAr: '...', titleEn: '...' } دون وجود title
      for (const baseKey of baseKeys) {
        if (!(baseKey in localizedObj)) {
          const keyAr = `${baseKey}Ar`;
          const keyEn = `${baseKey}En`;
          const valAr = data[keyAr];
          const valEn = data[keyEn];

          if (lang === 'ar') {
            localizedObj[baseKey] = this.localize(
              valAr !== undefined && valAr !== null ? valAr : valEn,
              lang,
            );
          } else {
            localizedObj[baseKey] = this.localize(
              valEn !== undefined && valEn !== null ? valEn : valAr,
              lang,
            );
          }
        }
      }

      return localizedObj;
    }

    return data;
  }
}
