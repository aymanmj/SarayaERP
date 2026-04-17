import { Test, TestingModule } from '@nestjs/testing';
import { DischargeSummaryService } from './discharge-summary.service';
import { PrismaService } from '../prisma/prisma.service';
import { createPrismaMock } from '../test-utils';

describe('DischargeSummaryService', () => {
  let service: DischargeSummaryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DischargeSummaryService,
        { provide: PrismaService, useValue: createPrismaMock() },
      ],
    }).compile();

    service = module.get<DischargeSummaryService>(DischargeSummaryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
