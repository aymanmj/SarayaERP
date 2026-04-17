import { Test, TestingModule } from '@nestjs/testing';
import { createPrismaMock, mockEventEmitter, mockAccountingService, mockSoftDeleteService } from '../test-utils';
import { PatientsService } from '../patients/patients.service';
import { EncountersService } from '../encounters/encounters.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AccountingService } from '../accounting/accounting.service';
import { SoftDeleteService } from '../common/soft-delete.service';
import { SystemSettingsService } from '../system-settings/system-settings.service';
import { PriceListsService } from '../price-lists/price-lists.service';

describe('Patient Journey Integration Tests', () => {
  let patientsService: PatientsService;
  let encountersService: EncountersService;

  const mockSystemSettings = {
    get: jest.fn().mockResolvedValue(null),
    getNumber: jest.fn().mockResolvedValue(0.01),
    getString: jest.fn().mockResolvedValue(''),
    set: jest.fn(),
  };

  const mockPriceService = {
    getServicePrice: jest.fn().mockResolvedValue(50),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientsService,
        EncountersService,
        { provide: PrismaService, useValue: createPrismaMock() },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: AccountingService, useValue: mockAccountingService },
        { provide: SoftDeleteService, useValue: mockSoftDeleteService },
        { provide: SystemSettingsService, useValue: mockSystemSettings },
        { provide: PriceListsService, useValue: mockPriceService },
      ],
    }).compile();

    patientsService = module.get<PatientsService>(PatientsService);
    encountersService = module.get<EncountersService>(EncountersService);
  });

  it('should be defined', () => {
    expect(patientsService).toBeDefined();
    expect(encountersService).toBeDefined();
  });
});
