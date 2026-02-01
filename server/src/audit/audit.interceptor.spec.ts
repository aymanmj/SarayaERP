
import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { of } from 'rxjs';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';
import { Sensitive } from './audit.decorator';

describe('AuditInterceptor', () => {
  let interceptor: AuditInterceptor;
  let auditService: AuditService;
  let reflector: Reflector;

  beforeEach(async () => {
    const auditServiceMock = {
      log: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditInterceptor,
        { provide: AuditService, useValue: auditServiceMock },
        Reflector,
      ],
    }).compile();

    interceptor = module.get<AuditInterceptor>(AuditInterceptor);
    auditService = module.get<AuditService>(AuditService);
    reflector = module.get<Reflector>(Reflector);
  });

  const createMockContext = (
    method: string,
    path: string,
    handler: Function,
    classRef: any,
  ) => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          method,
          originalUrl: path,
          user: { sub: 1, hospitalId: 1 },
          ip: '127.0.0.1',
          headers: {},
        }),
        getResponse: () => ({ statusCode: 200 }),
      }),
      getHandler: () => handler,
      getClass: () => classRef,
    } as unknown as ExecutionContext;
  };

  const next: CallHandler = {
    handle: () => of('response'),
  };

  it('should log mutation requests (POST)', (done) => {
    const context = createMockContext('POST', '/test', () => {}, {});
    
    interceptor.intercept(context, next).subscribe(() => {
      expect(auditService.log).toHaveBeenCalled();
      done();
    });
  });

  it('should log sensitive GET requests decorated with @Sensitive', (done) => {
    class TestClass {
      @Sensitive('VIEW_SENSITIVE')
      testMethod() {}
    }
    const handler = new TestClass().testMethod;
    
    const context = createMockContext('GET', '/sensitive', handler, TestClass);

    interceptor.intercept(context, next).subscribe(() => {
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'VIEW_SENSITIVE',
        }),
      );
      done();
    });
  });

  it('should NOT log normal GET requests without decoration', (done) => {
    const context = createMockContext('GET', '/normal', () => {}, {});

    interceptor.intercept(context, next).subscribe(() => {
      expect(auditService.log).not.toHaveBeenCalled();
      done();
    });
  });
});
