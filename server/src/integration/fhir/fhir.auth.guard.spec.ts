import { Test, TestingModule } from '@nestjs/testing';
import { FhirAuthGuard } from './fhir.auth.guard';
import { FhirAuthService } from './fhir.auth.service';
import { Reflector } from '@nestjs/core';
import { ExecutionContext, UnauthorizedException } from '@nestjs/common';

describe('FhirAuthGuard', () => {
  let guard: FhirAuthGuard;
  let authService: jest.Mocked<FhirAuthService>;
  let reflector: jest.Mocked<Reflector>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FhirAuthGuard,
        {
          provide: FhirAuthService,
          useValue: {
            validateToken: jest.fn(),
          },
        },
        {
          provide: Reflector,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    guard = module.get<FhirAuthGuard>(FhirAuthGuard);
    authService = module.get(FhirAuthService);
    reflector = module.get(Reflector);
  });

  it('should be defined', () => {
    expect(guard).toBeDefined();
  });

  const createMockContext = (
    headers: Record<string, string>,
    path: string = '/api/fhir/Patient/123',
  ): ExecutionContext => {
    const req = {
      headers,
      path,
      method: 'GET',
    };
    return {
      switchToHttp: () => ({
        getRequest: () => req,
      }),
      getHandler: () => ({}),
    } as any;
  };

  it('should allow public access to /fhir/metadata', () => {
    const context = createMockContext({}, '/api/fhir/metadata');
    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw UnauthorizedException if no auth header', () => {
    const context = createMockContext({});
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should inject patient-scoped SMART context successfully', () => {
    const context = createMockContext({ authorization: 'Bearer valid_token' });
    reflector.get.mockReturnValue('patient/*.read');

    authService.validateToken.mockReturnValue({
      patient: '123',
      scope: 'patient/*.read',
      client_id: 'mpi_federation',
      sub: '123',
    });

    const result = guard.canActivate(context);
    expect(result).toBe(true);

    const req = context.switchToHttp().getRequest<any>();
    expect(req.smartContext).toBeDefined();
    expect(req.smartContext.patient).toBe('123'); // Patient isolation context is set
    expect(req.smartContext.scope).toBe('patient/*.read');
  });

  it('should treat token as system-level if patient is not in payload', () => {
    const context = createMockContext({ authorization: 'Bearer valid_token' });
    reflector.get.mockReturnValue('patient/*.read');

    authService.validateToken.mockReturnValue({
      scope: 'patient/*.read',
      client_id: 'enterprise_app',
      sub: 'sys_admin',
    });

    const result = guard.canActivate(context);
    expect(result).toBe(true);

    const req = context.switchToHttp().getRequest<any>();
    expect(req.smartContext).toBeDefined();
    expect(req.smartContext.patient).toBeUndefined(); // Represents system level
  });
});
