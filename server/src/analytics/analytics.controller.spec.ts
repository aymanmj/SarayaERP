import { Test, TestingModule } from '@nestjs/testing';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsController', () => {
  let controller: AnalyticsController;
  let service: AnalyticsService;

  const mockService = {
    getExecutiveStats: jest.fn(),
    getClinicalVarianceReport: jest.fn(),
    getClinicalKPIs: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyticsController],
      providers: [{ provide: AnalyticsService, useValue: mockService }],
    }).compile();

    controller = module.get<AnalyticsController>(AnalyticsController);
    service = module.get<AnalyticsService>(AnalyticsService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should get clinical KPIs', async () => {
    const mockRes = { readmissionRate: 10 };
    mockService.getClinicalKPIs.mockResolvedValue(mockRes);

    const user = { hospitalId: 1 };
    const req = { query: { startDate: '2026-05-01', endDate: '2026-05-30' } };
    const res = await controller.getClinicalKPIs(user, req);

    expect(res).toEqual(mockRes);
    expect(mockService.getClinicalKPIs).toHaveBeenCalledWith(
      1,
      expect.any(Date),
      expect.any(Date),
    );
  });

  it('should get variance report', async () => {
    mockService.getClinicalVarianceReport.mockResolvedValue({});
    const req = { query: {} }; // no dates provided
    await controller.getClinicalVarianceReport({ hospitalId: 1 }, req);
    expect(mockService.getClinicalVarianceReport).toHaveBeenCalled();
  });
});
