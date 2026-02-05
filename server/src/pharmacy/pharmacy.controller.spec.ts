import { Test, TestingModule } from '@nestjs/testing';
import { PharmacyController } from './pharmacy.controller';
import { PharmacyService } from './pharmacy.service';

describe('PharmacyController', () => {
  let controller: PharmacyController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PharmacyController],
      providers: [
        {
          provide: PharmacyService,
          useValue: {
            getDrugCatalog: jest.fn(),
            getEncounterPrescriptions: jest.fn(),
            createPrescriptionForEncounter: jest.fn(),
            getWorklist: jest.fn(),
            dispensePrescription: jest.fn(),
            getDrugStockList: jest.fn(),
            createManualStockTransaction: jest.fn(),
            getStockTransactionsReport: jest.fn(),
            getEncounterDispensesSummary: jest.fn(),
            dispenseAndPay: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<PharmacyController>(PharmacyController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
