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
    } as unknown as ExecutionContext;
  };

  it('should allow public access to /fhir/metadata', async () => {
    const context = createMockContext({}, '/api/fhir/metadata');
    expect(await guard.canActivate(context)).toBe(true);
  });

  it('should throw UnauthorizedException if no auth header', async () => {
    const context = createMockContext({});
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should inject patient-scoped SMART context successfully', async () => {
    const context = createMockContext({ authorization: 'Bearer valid_token' });
    reflector.get.mockReturnValue('patient/*.read');

    authService.validateToken.mockResolvedValue({
      patient: '123',
      scope: 'patient/*.read',
      client_id: 'mpi_federation',
      sub: '123',
    });

    const result = await guard.canActivate(context);
    expect(result).toBe(true);

    const req = context.switchToHttp().getRequest();
    expect(req.smartContext).toBeDefined();
    expect(req.smartContext?.patient).toBe('123'); // Patient isolation context is set
    expect(req.smartContext?.scope).toBe('patient/*.read');
  });

  it('should treat token as system-level if patient is not in payload', async () => {
    const context = createMockContext({ authorization: 'Bearer valid_token' });
    reflector.get.mockReturnValue('patient/*.read');

    authService.validateToken.mockResolvedValue({
      scope: 'patient/*.read',
      client_id: 'enterprise_app',
      sub: 'sys_admin',
    });

    const result = await guard.canActivate(context);
    expect(result).toBe(true);

    const req = context.switchToHttp().getRequest();
    expect(req.smartContext).toBeDefined();
    expect(req.smartContext?.patient).toBeUndefined(); // Represents system level
  });
});
