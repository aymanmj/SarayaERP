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
      error: undefined
    });

    const result = controller.getInfo();
    expect(result.details?.isGracePeriod).toBe(true);
  });
});
