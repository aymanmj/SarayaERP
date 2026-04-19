import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { VisitsController } from './visits.controller';
import { VisitsService } from './visits.service';

describe('VisitsController', () => {
  let controller: VisitsController;
  let visitsService: any;

  const user = { sub: 18, hospitalId: 2, roles: ['DOCTOR'] };

  beforeEach(async () => {
    visitsService = {
      createVisit: jest.fn(),
      listForEncounter: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [VisitsController],
      providers: [{ provide: VisitsService, useValue: visitsService }],
    }).compile();

    controller = module.get<VisitsController>(VisitsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('creates a visit using the authenticated doctor id', async () => {
    visitsService.createVisit.mockResolvedValue({ id: 70 });

    const result = await controller.create(
      {
        encounterId: 10,
        notes: 'Patient stable',
        diagnosisText: 'Viral syndrome',
      } as any,
      user as any,
    );

    expect(result).toEqual({ id: 70 });
    expect(visitsService.createVisit).toHaveBeenCalledWith({
      encounterId: 10,
      doctorId: 18,
      notes: 'Patient stable',
      diagnosisText: 'Viral syndrome',
    });
  });

  it('rejects invalid encounter ids when listing visits', async () => {
    expect(() => controller.listForEncounter('NaN')).toThrow(BadRequestException);
  });

  it('lists visits for a valid encounter id', async () => {
    visitsService.listForEncounter.mockResolvedValue([{ id: 1 }]);

    const result = await controller.listForEncounter('10');

    expect(result).toEqual([{ id: 1 }]);
    expect(visitsService.listForEncounter).toHaveBeenCalledWith(10);
  });
});
