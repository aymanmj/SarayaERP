import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentsService } from './appointments.service';
import { PrismaService } from '../prisma/prisma.service';
import { PriceListsService } from '../price-lists/price-lists.service';
import { AccountingService } from '../accounting/accounting.service';
import { createPrismaMock, mockAccountingService } from '../test-utils';

describe('AppointmentsService', () => {
  let service: AppointmentsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AppointmentsService,
        { provide: PrismaService, useValue: createPrismaMock() },
        { provide: AccountingService, useValue: mockAccountingService },
        { 
          provide: PriceListsService, 
          useValue: {
            getPriceForService: jest.fn(),
            getPriceForProduct: jest.fn(),
            createPriceList: jest.fn(),
          } 
        },
      ],
    }).compile();

    service = module.get<AppointmentsService>(AppointmentsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
