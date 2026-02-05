import { Test, TestingModule } from '@nestjs/testing';
import { AuditInterceptor } from './audit.interceptor';
import { AuditService } from './audit.service';
import { Reflector } from '@nestjs/core';

describe('AuditInterceptor', () => {
  let interceptor: AuditInterceptor;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuditInterceptor,
        {
          provide: AuditService,
          useValue: {
            log: jest.fn(),
          },
        },
        {
          provide: Reflector,
          useValue: {
            getAllAndOverride: jest.fn(),
          },
        },
      ],
    }).compile();

    interceptor = module.get<AuditInterceptor>(AuditInterceptor);
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });
});
