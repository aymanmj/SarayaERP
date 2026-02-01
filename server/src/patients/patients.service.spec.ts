import { Test, TestingModule } from '@nestjs/testing';
import { PatientsService } from './patients.service';

import { PrismaService } from '../prisma/prisma.service';

import { SoftDeleteService } from '../common/soft-delete.service';

describe('PatientsService', () => {
  let service: PatientsService;

  const mockPrismaService = {
    patient: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    $transaction: jest.fn((fn) => Promise.resolve([[], 0])), // simplified transaction mock
  };

  const mockSoftDeleteService = {
    softDelete: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PatientsService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: SoftDeleteService, useValue: mockSoftDeleteService },
      ],
    }).compile();

    service = module.get<PatientsService>(PatientsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
