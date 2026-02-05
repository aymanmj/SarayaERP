import { Test, TestingModule } from '@nestjs/testing';
import { LabOrdersService } from './lab-orders.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import { createPrismaMock, mockAccountingService } from '../test-utils';

describe('LabOrdersService', () => {
  let service: LabOrdersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LabOrdersService,
        {
          provide: PrismaService,
          useValue: createPrismaMock(),
        },
        {
          provide: AccountingService,
          useValue: mockAccountingService,
        },
      ],
    }).compile();

    service = module.get<LabOrdersService>(LabOrdersService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
