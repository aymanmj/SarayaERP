import { Test, TestingModule } from '@nestjs/testing';
import { DischargeSummaryController } from './discharge-summary.controller';
import { DischargeSummaryService } from './discharge-summary.service';

describe('DischargeSummaryController', () => {
  let controller: DischargeSummaryController;

  const mockDischargeSummaryService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    signOff: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DischargeSummaryController],
      providers: [
        { provide: DischargeSummaryService, useValue: mockDischargeSummaryService },
      ],
    }).compile();

    controller = module.get<DischargeSummaryController>(DischargeSummaryController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
