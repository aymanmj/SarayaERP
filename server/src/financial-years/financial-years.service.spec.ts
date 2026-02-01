import { Test, TestingModule } from '@nestjs/testing';
import { FinancialYearsService } from './financial-years.service';
import { PrismaService } from '../prisma/prisma.service';

describe('FinancialYearsService', () => {
  let service: FinancialYearsService;

  const mockPrismaService = {
    financialYear: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    financialPeriod: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((fn) => fn(mockPrismaService)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FinancialYearsService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<FinancialYearsService>(FinancialYearsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
