import { Test, TestingModule } from '@nestjs/testing';
import { LicenseController } from './license.controller';
import { LicenseService } from './license.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPrismaMock } from '../test-utils';

describe('LicenseController', () => {
  let controller: LicenseController;
  let service: LicenseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LicenseController],
      providers: [
        LicenseService,
        {
          provide: PrismaService,
          useValue: createPrismaMock(),
        },
      ],
    }).compile();

    controller = module.get<LicenseController>(LicenseController);
    service = module.get<LicenseService>(LicenseService);
  });

  it('should return planInfo structure in details', () => {
    jest.spyOn(service, 'getStatus').mockReturnValue({
      isValid: true,
      machineId: 'TEST-MACHINE-ID',
      plan: 'PRO',
      hospitalName: 'Test Hospital',
      expiryDate: '2025-12-31',
      maxUsers: 10,
      modules: [],
      isGracePeriod: true,
      daysRemaining: 7,
      error: undefined,
    });

    const result = controller.getInfo();
    expect(result.details?.isGracePeriod).toBe(true);
    expect(result.machineId).toBe('TEST-MACHINE-ID');
  });

  it('redacts licensePath always and omits machineId on active non-grace status/info', () => {
    jest.spyOn(service, 'getStatus').mockReturnValue({
      isValid: true,
      machineId: 'SECRET-HW-FINGERPRINT',
      plan: 'ENTERPRISE',
      hospitalName: 'Test Hospital',
      expiryDate: '2040-01-01',
      maxUsers: 100,
      modules: ['CORE'],
      isGracePeriod: false,
      daysRemaining: 500,
      licensePath: 'C:\\Saraya\\secret\\license.key',
    });

    const status = controller.getStatus();
    expect(status).not.toHaveProperty('licensePath');
    expect(status).not.toHaveProperty('machineId');
    expect(status.isValid).toBe(true);
    expect(status.plan).toBe('ENTERPRISE');

    const info = controller.getInfo();
    expect(info.machineId).toBeUndefined();
    expect(info.isValid).toBe(true);
    expect(info.details?.plan).toBe('ENTERPRISE');
  });

  it('exposes machineId on public status/info only when activation or renewal is required', () => {
    jest.spyOn(service, 'getStatus').mockReturnValue({
      isValid: false,
      machineId: 'NEED-ACTIVATION-ID',
      error: 'No license found',
      licensePath: '/app/data/license.key',
    });

    const status = controller.getStatus();
    expect(status).not.toHaveProperty('licensePath');
    expect(status.machineId).toBe('NEED-ACTIVATION-ID');
    expect(status.isValid).toBe(false);

    const info = controller.getInfo();
    expect(info.machineId).toBe('NEED-ACTIVATION-ID');
    expect(info.details).toBeNull();
  });
});
