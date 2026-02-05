import { Test, TestingModule } from '@nestjs/testing';
import { PharmacyService } from './pharmacy.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AccountingService } from '../accounting/accounting.service';
import { CDSSService } from '../cdss/cdss.service';
import { createPrismaMock, mockEventEmitter, mockAccountingService, mockCDSSService } from '../test-utils';

describe('PharmacyService', () => {
  let service: PharmacyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PharmacyService,
        {
          provide: PrismaService,
          useValue: createPrismaMock(),
        },
        {
          provide: EventEmitter2,
          useValue: mockEventEmitter,
        },
        {
          provide: AccountingService,
          useValue: mockAccountingService,
        },
        {
          provide: CDSSService,
          useValue: mockCDSSService,
        },
      ],
    }).compile();

    service = module.get<PharmacyService>(PharmacyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
