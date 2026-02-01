
import { Test, TestingModule } from '@nestjs/testing';
import { LicenseService } from './license.service';
import { LicenseController } from './license.controller';
import * as fs from 'fs';

// Mock dependencies if needed
jest.mock('fs');
jest.mock('node-machine-id', () => ({
  machineIdSync: jest.fn(() => 'TEST-MACHINE-ID'),
}));

describe('LicenseController', () => {
  let controller: LicenseController;
  let service: LicenseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LicenseController],
      providers: [LicenseService],
    }).compile();

    controller = module.get<LicenseController>(LicenseController);
    service = module.get<LicenseService>(LicenseService);
  });

  it('should return planInfo structure in details', () => {
    // Mock service state
    // Mock getStatus to return what we want
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
    if (result.details?.isGracePeriod === true) {
        expect(true).toBe(true);
    } else {
        // Fail the test
        expect(result.details?.isGracePeriod).toBe(true);
    }
  });
});
