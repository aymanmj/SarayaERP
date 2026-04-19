import { Test, TestingModule } from '@nestjs/testing';
import { LabController } from './labs.controller';
import { LabService } from './labs.service';

describe('LabController', () => {
  let controller: LabController;
  let labService: any;

  const user = { sub: 17, hospitalId: 3, roles: ['LAB_TECH'] };

  beforeEach(async () => {
    labService = {
      getCatalog: jest.fn(),
      listOrdersForEncounter: jest.fn(),
      createOrdersForEncounter: jest.fn(),
      getWorklist: jest.fn(),
      startProcessing: jest.fn(),
      completeOrder: jest.fn(),
      getCumulativeReport: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LabController],
      providers: [{ provide: LabService, useValue: labService }],
    }).compile();

    controller = module.get<LabController>(LabController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('loads catalog for the current hospital', async () => {
    labService.getCatalog.mockResolvedValue([{ id: 1 }]);

    const result = await controller.getCatalog({ user } as any);

    expect(result).toEqual([{ id: 1 }]);
    expect(labService.getCatalog).toHaveBeenCalledWith(3);
  });

  it('creates lab orders using current doctor when dto doctorId is missing', async () => {
    labService.createOrdersForEncounter.mockResolvedValue({ count: 2 });

    const result = await controller.createOrdersForEncounter(
      44,
      {
        testIds: ['1', 2, '3'],
        notes: 'STAT',
      } as any,
      { user } as any,
    );

    expect(result).toEqual({ count: 2 });
    expect(labService.createOrdersForEncounter).toHaveBeenCalledWith({
      encounterId: 44,
      hospitalId: 3,
      doctorId: 17,
      testIds: [1, 2, 3],
      notes: 'STAT',
    });
  });

  it('starts processing with hospital and performer context', async () => {
    labService.startProcessing.mockResolvedValue({ id: 9, status: 'IN_PROGRESS' });

    await controller.startOrder(9, { user } as any);

    expect(labService.startProcessing).toHaveBeenCalledWith(3, 9, 17);
  });

  it('completes an order with normalized lab result payload', async () => {
    labService.completeOrder.mockResolvedValue({ id: 9, status: 'COMPLETED' });

    await controller.completeOrder(
      9,
      {
        resultValue: '6.4',
        resultUnit: 'mmol/L',
        referenceRange: '4.0-7.0',
      } as any,
      { user } as any,
    );

    expect(labService.completeOrder).toHaveBeenCalledWith({
      hospitalId: 3,
      labOrderId: 9,
      performedById: 17,
      resultValue: '6.4',
      resultUnit: 'mmol/L',
      referenceRange: '4.0-7.0',
    });
  });

  it('returns cumulative report within the current hospital boundary', async () => {
    labService.getCumulativeReport.mockResolvedValue({ encounterId: 44 });

    const result = await controller.getCumulativeReport(44, { user } as any);

    expect(result).toEqual({ encounterId: 44 });
    expect(labService.getCumulativeReport).toHaveBeenCalledWith(3, 44);
  });
});
