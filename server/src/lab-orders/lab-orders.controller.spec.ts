import { Test, TestingModule } from '@nestjs/testing';
import {
  LabOrdersController,
  LabOrdersGeneralController,
} from './lab-orders.controller';
import { LabOrdersService } from './lab-orders.service';

describe('LabOrdersController', () => {
  let encounterController: LabOrdersController;
  let generalController: LabOrdersGeneralController;
  let labOrdersService: any;

  beforeEach(async () => {
    labOrdersService = {
      listForEncounter: jest.fn(),
      createForEncounter: jest.fn(),
      getWorklist: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LabOrdersController, LabOrdersGeneralController],
      providers: [{ provide: LabOrdersService, useValue: labOrdersService }],
    }).compile();

    encounterController = module.get<LabOrdersController>(LabOrdersController);
    generalController = module.get<LabOrdersGeneralController>(
      LabOrdersGeneralController,
    );
  });

  it('should be defined', () => {
    expect(encounterController).toBeDefined();
    expect(generalController).toBeDefined();
  });

  it('lists lab orders for a specific encounter', async () => {
    labOrdersService.listForEncounter.mockResolvedValue([{ id: 5 }]);

    const result = await encounterController.listForEncounter(12);

    expect(result).toEqual([{ id: 5 }]);
    expect(labOrdersService.listForEncounter).toHaveBeenCalledWith(12);
  });

  it('creates lab orders by combining route and body payload', async () => {
    labOrdersService.createForEncounter.mockResolvedValue({ count: 2 });

    const result = await encounterController.createForEncounter(12, {
      hospitalId: 4,
      doctorId: 8,
      testIds: [1, 2],
      notes: 'Fasting',
    });

    expect(result).toEqual({ count: 2 });
    expect(labOrdersService.createForEncounter).toHaveBeenCalledWith({
      encounterId: 12,
      hospitalId: 4,
      doctorId: 8,
      testIds: [1, 2],
      notes: 'Fasting',
    });
  });

  it('loads worklist for the authenticated hospital', async () => {
    labOrdersService.getWorklist.mockResolvedValue([{ id: 3 }]);

    const result = await generalController.worklist({
      user: { hospitalId: 4 },
    } as any);

    expect(result).toEqual([{ id: 3 }]);
    expect(labOrdersService.getWorklist).toHaveBeenCalledWith(4);
  });
});
