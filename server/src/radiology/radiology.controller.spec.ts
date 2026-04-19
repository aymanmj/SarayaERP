import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { RadiologyController } from './radiology.controller';
import { RadiologyService } from './radiology.service';

describe('RadiologyController', () => {
  let controller: RadiologyController;
  let radiologyService: any;

  const user = { sub: 14, hospitalId: 5, roles: ['RAD_TECH'] };

  beforeEach(async () => {
    radiologyService = {
      getCatalog: jest.fn(),
      listOrdersForEncounter: jest.fn(),
      createOrdersForEncounter: jest.fn(),
      getWorklist: jest.fn(),
      startProcessing: jest.fn(),
      getOrderById: jest.fn(),
      completeOrderWithReport: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [RadiologyController],
      providers: [{ provide: RadiologyService, useValue: radiologyService }],
    }).compile();

    controller = module.get<RadiologyController>(RadiologyController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('rejects creating radiology orders without studies', async () => {
    await expect(
      controller.createOrdersForEncounter(
        { user } as any,
        21,
        { studyIds: [] } as any,
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('creates radiology orders with normalized studies and doctor fallback', async () => {
    radiologyService.createOrdersForEncounter.mockResolvedValue({ count: 2 });

    const result = await controller.createOrdersForEncounter(
      { user } as any,
      21,
      {
        studyIds: ['7', 9],
        notes: 'Portable study',
      } as any,
    );

    expect(result).toEqual({ count: 2 });
    expect(radiologyService.createOrdersForEncounter).toHaveBeenCalledWith({
      encounterId: 21,
      hospitalId: 5,
      doctorId: 14,
      studyIds: [7, 9],
      notes: 'Portable study',
    });
  });

  it('starts radiology processing with hospital and performer context', async () => {
    radiologyService.startProcessing.mockResolvedValue({ id: 11, status: 'IN_PROGRESS' });

    await controller.startOrder({ user } as any, 11);

    expect(radiologyService.startProcessing).toHaveBeenCalledWith(5, 11, 14);
  });

  it('loads order details within the current hospital context', async () => {
    radiologyService.getOrderById.mockResolvedValue({ id: 33 });

    const result = await controller.getOrder({ user } as any, 33);

    expect(result).toEqual({ id: 33 });
    expect(radiologyService.getOrderById).toHaveBeenCalledWith(5, 33);
  });

  it('reports a study using reporter identity from the token', async () => {
    radiologyService.completeOrderWithReport.mockResolvedValue({
      id: 11,
      status: 'COMPLETED',
    });

    await controller.reportOrder(
      { user } as any,
      11,
      { reportText: 'No acute findings.' } as any,
    );

    expect(radiologyService.completeOrderWithReport).toHaveBeenCalledWith({
      hospitalId: 5,
      radiologyOrderId: 11,
      reportedById: 14,
      reportText: 'No acute findings.',
    });
  });
});
