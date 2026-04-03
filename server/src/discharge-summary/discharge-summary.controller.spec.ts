import { Test, TestingModule } from '@nestjs/testing';
import { DischargeSummaryController } from './discharge-summary.controller';

describe('DischargeSummaryController', () => {
  let controller: DischargeSummaryController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [DischargeSummaryController],
    }).compile();

    controller = module.get<DischargeSummaryController>(DischargeSummaryController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
