import { Test, TestingModule } from '@nestjs/testing';
import { QualityController } from './quality.controller';
import { QualityService } from './quality.service';

describe('QualityController', () => {
  let controller: QualityController;
  let service: QualityService;

  const mockService = {
    reportIncident: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    updateIncident: jest.fn(),
    closeIncident: jest.fn(),
    getDashboardStats: jest.fn(),
    addCapaAction: jest.fn(),
    updateCapaAction: jest.fn(),
    verifyCapaAction: jest.fn(),
    getMyCapaTasks: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QualityController],
      providers: [
        { provide: QualityService, useValue: mockService },
      ],
    }).compile();

    controller = module.get<QualityController>(QualityController);
    service = module.get<QualityService>(QualityService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call getDashboard', async () => {
    mockService.getDashboardStats.mockResolvedValue({ total: 10 });
    const res = await controller.getDashboard({ hospitalId: 1 } as any);
    expect(res).toEqual({ total: 10 });
    expect(mockService.getDashboardStats).toHaveBeenCalledWith(1);
  });

  it('should call reportIncident', async () => {
    mockService.reportIncident.mockResolvedValue({ id: 1 });
    const dto = { incidentDate: '2026-05-17', incidentType: 'OTHER' as any, severity: 'MINOR' as any, description: 'Test' };
    await controller.reportIncident({ hospitalId: 1, sub: 2 } as any, dto);
    expect(mockService.reportIncident).toHaveBeenCalledWith(1, 2, dto);
  });
});
