import { Test, TestingModule } from '@nestjs/testing';
import { CashierService } from './cashier.service';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import { createPrismaMock, mockAccountingService } from '../test-utils';

describe('CashierService', () => {
  let service: CashierService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CashierService,
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

    service = module.get<CashierService>(CashierService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
