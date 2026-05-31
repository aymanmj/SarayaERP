// src/common/interceptors/localization.interceptor.spec.ts
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of } from 'rxjs';
import { LocalizationInterceptor } from './localization.interceptor';

describe('LocalizationInterceptor', () => {
  let interceptor: LocalizationInterceptor;

  beforeEach(() => {
    interceptor = new LocalizationInterceptor();
  });

  const createMockContext = (
    acceptLanguageHeader: string,
  ): ExecutionContext => {
    const request = {
      headers: {
        'accept-language': acceptLanguageHeader,
      },
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;
  };

  const createMockCallHandler = (data: any): CallHandler => {
    return {
      handle: () => of(data),
    };
  };

  it('should translate fields to Arabic when accept-language is ar', async () => {
    const mockData = {
      name: 'Default Name',
      nameAr: 'الاسم بالعربية',
      nameEn: 'Name in English',
      descriptionAr: 'الوصف بالعربية',
      descriptionEn: 'Description in English',
      otherField: 'Other Value',
    };

    const context = createMockContext('ar');
    const handler = createMockCallHandler(mockData);

    const result = await interceptor.intercept(context, handler).toPromise();

    expect(result).toEqual({
      name: 'الاسم بالعربية',
      description: 'الوصف بالعربية',
      otherField: 'Other Value',
    });
  });

  it('should translate fields to English when accept-language is en', async () => {
    const mockData = {
      name: 'Default Name',
      nameAr: 'الاسم بالعربية',
      nameEn: 'Name in English',
      descriptionAr: 'الوصف بالعربية',
      descriptionEn: 'Description in English',
      otherField: 'Other Value',
    };

    const context = createMockContext('en');
    const handler = createMockCallHandler(mockData);

    const result = await interceptor.intercept(context, handler).toPromise();

    expect(result).toEqual({
      name: 'Name in English',
      description: 'Description in English',
      otherField: 'Other Value',
    });
  });

  it('should handle nested objects and arrays recursively', async () => {
    const mockData = [
      {
        id: 1,
        titleAr: 'العنوان 1',
        titleEn: 'Title 1',
        details: {
          messageAr: 'الرسالة',
          messageEn: 'Message',
        },
      },
    ];

    const context = createMockContext('ar');
    const handler = createMockCallHandler(mockData);

    const result = await interceptor.intercept(context, handler).toPromise();

    expect(result).toEqual([
      {
        id: 1,
        title: 'العنوان 1',
        details: {
          message: 'الرسالة',
        },
      },
    ]);
  });

  it('should preserve Decimal instances as is', async () => {
    class Decimal {
      constructor(public s: number, public e: number, public d: number[]) {}
    }
    const mockDecimal = new Decimal(1, 2, [2, 5, 0]);
    const mockData = {
      price: mockDecimal,
      nameAr: 'اسم الخدمة',
      nameEn: 'Service Name',
    };

    const context = createMockContext('ar');
    const handler = createMockCallHandler(mockData);

    const result = await interceptor.intercept(context, handler).toPromise();

    expect(result.price).toBeInstanceOf(Decimal);
    expect(result.price).toBe(mockDecimal);
    expect(result.name).toBe('اسم الخدمة');
  });
});
