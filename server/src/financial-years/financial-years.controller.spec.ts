import { Test, TestingModule } from '@nestjs/testing';
import { FinancialYearsController } from './financial-years.controller';

describe('FinancialYearsController', () => {
  let controller: FinancialYearsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FinancialYearsController],
    }).compile();

    controller = module.get<FinancialYearsController>(FinancialYearsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
