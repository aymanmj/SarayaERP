import { ConnectivityService } from '../src/common/services/connectivity.service';
import { LicenseService } from '../src/licensing/license.service';
import { PdfService } from '../src/pdf/pdf.service';
import { BackupService } from '../src/backup/backup.service';

// Database and Redis remain real. Only the outbound internet probe is disabled.
beforeAll(() => {
  jest.spyOn(ConnectivityService.prototype, 'onModuleInit').mockResolvedValue();
  // Model a licensed installation without a real license/hardware identity.
  // License validation is covered separately; staff authorization is never mocked.
  jest.spyOn(LicenseService.prototype, 'onModuleInit').mockResolvedValue();
  jest.spyOn(LicenseService.prototype, 'getStatus').mockReturnValue({
    isValid: true,
    machineId: 'synthetic-test-machine',
  });
  jest.spyOn(LicenseService.prototype, 'isModuleEnabled').mockReturnValue(true);
  // These suites do not exercise document rendering or backup workers.
  jest.spyOn(PdfService.prototype, 'onModuleInit').mockResolvedValue();
  jest
    .spyOn(BackupService.prototype, 'onModuleInit')
    .mockImplementation(() => undefined);
});

afterAll(() => jest.restoreAllMocks());
