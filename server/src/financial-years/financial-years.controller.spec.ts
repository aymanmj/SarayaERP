import { Test, TestingModule } from '@nestjs/testing';
import { FinancialYearsController } from './financial-years.controller';
import { FinancialYearsService } from './financial-years.service';

describe('FinancialYearsController', () => {
  let controller: FinancialYearsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [FinancialYearsController],
      providers: [
        {
          provide: FinancialYearsService,
          useValue: {
            listYears: jest.fn(),
            createYear: jest.fn(),
            updateYearStatus: jest.fn(),
            generateMonthlyPeriods: jest.fn(),
            listPeriods: jest.fn(),
            openPeriod: jest.fn(),
            closePeriod: jest.fn(),
            getCurrentYearNullable: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<FinancialYearsController>(FinancialYearsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
