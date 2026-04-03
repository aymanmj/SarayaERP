import { Test, TestingModule } from '@nestjs/testing';
import { DischargeSummaryService } from './discharge-summary.service';

describe('DischargeSummaryService', () => {
  let service: DischargeSummaryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DischargeSummaryService],
    }).compile();

    service = module.get<DischargeSummaryService>(DischargeSummaryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
