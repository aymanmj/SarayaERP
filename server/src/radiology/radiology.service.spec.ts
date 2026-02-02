import { Test, TestingModule } from '@nestjs/testing';
import { createPrismaMock } from '../test-utils';
import { RadiologyService } from './radiology.service';

import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import { PriceListsService } from '../price-lists/price-lists.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

describe('RadiologyService', () => {
  let service: RadiologyService;

  const mockPrismaService = ({
    radiologyOrder: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((fn) => fn(mockPrismaService)),
  });

  const mockAccountingService = {
    getCurrentPeriod: jest.fn(),
  };

  const mockPriceListsService = {
    getServicePrice: jest.fn(),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RadiologyService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: AccountingService, useValue: mockAccountingService },
        { provide: PriceListsService, useValue: mockPriceListsService },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<RadiologyService>(RadiologyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
