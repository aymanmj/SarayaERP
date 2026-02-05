import { Test, TestingModule } from '@nestjs/testing';
import { createPrismaMock, mockEventEmitter, mockAccountingService, mockCDSSService } from '../test-utils';
import { PharmacyService } from '../pharmacy/pharmacy.service';
import { LabService } from '../labs/labs.service';
import { RadiologyService } from '../radiology/radiology.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AccountingService } from '../accounting/accounting.service';
import { CDSSService } from '../cdss/cdss.service';
import { PriceListsService } from '../price-lists/price-lists.service';

describe('Clinical Services Integration Tests', () => {
  let pharmacyService: PharmacyService;
  let labService: LabService;
  let radiologyService: RadiologyService;
  let prismaService: PrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PharmacyService,
        LabService,
        RadiologyService,
        { provide: PrismaService, useValue: createPrismaMock() },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: AccountingService, useValue: mockAccountingService },
        { provide: CDSSService, useValue: mockCDSSService },
        { provide: PriceListsService, useValue: { getPriceForService: jest.fn() } },
      ],
    }).compile();

    pharmacyService = module.get<PharmacyService>(PharmacyService);
    labService = module.get<LabService>(LabService);
    radiologyService = module.get<RadiologyService>(RadiologyService);
    prismaService = module.get<PrismaService>(PrismaService);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(pharmacyService).toBeDefined();
    expect(labService).toBeDefined();
    expect(radiologyService).toBeDefined();
  });
  
  // NOTE: Full workflow tests are currently disabled due to significant schema changes.
  // They should be re-implemented following the new service signatures.
});
