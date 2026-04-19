import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { EncountersController } from './encounters.controller';
import { EncountersService } from './encounters.service';

describe('EncountersController', () => {
  let controller: EncountersController;
  let encountersService: any;

  const adminUser = { sub: 1, hospitalId: 9, roles: ['ADMIN'] };
  const doctorUser = { sub: 22, hospitalId: 9, roles: ['DOCTOR'] };

  beforeEach(async () => {
    encountersService = {
      createEncounter: jest.fn(),
      getEncounterById: jest.fn(),
      closeEncounter: jest.fn(),
      softDelete: jest.fn(),
      listActiveInpatients: jest.fn(),
      dischargePatient: jest.fn(),
      assignDoctor: jest.fn(),
      admitPatientFromER: jest.fn(),
      findAll: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [EncountersController],
      providers: [{ provide: EncountersService, useValue: encountersService }],
    }).compile();

    controller = module.get<EncountersController>(EncountersController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('creates an encounter within the current hospital context', async () => {
    encountersService.createEncounter.mockResolvedValue({ id: 50 });

    const result = await controller.create(
      {
        patientId: 5,
        type: 'ER' as any,
        departmentId: 3,
        doctorId: 22,
        chiefComplaint: 'Chest pain',
      } as any,
      adminUser as any,
    );

    expect(result).toEqual({ id: 50 });
    expect(encountersService.createEncounter).toHaveBeenCalledWith(9, {
      patientId: 5,
      type: 'ER',
      departmentId: 3,
      doctorId: 22,
      chiefComplaint: 'Chest pain',
    });
  });

  it('rejects invalid encounter ids before loading details', async () => {
    await expect(controller.getOne('bad-id', adminUser as any)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('prevents a doctor from opening another doctor encounter', async () => {
    encountersService.getEncounterById.mockResolvedValue({ id: 8, doctorId: 99 });

    await expect(controller.getOne('8', doctorUser as any)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('lists encounters with parsed filters and default page', async () => {
    encountersService.findAll.mockResolvedValue({ items: [], total: 0 });

    await controller.list(
      adminUser as any,
      '44',
      'ER' as any,
      'OPEN' as any,
      'Ahmed',
      undefined,
    );

    expect(encountersService.findAll).toHaveBeenCalledWith({
      hospitalId: 9,
      patientId: 44,
      type: 'ER',
      status: 'OPEN',
      search: 'Ahmed',
      page: 1,
    });
  });

  it('routes admission from ER with department payload', async () => {
    encountersService.admitPatientFromER.mockResolvedValue({ id: 8, type: 'IPD' });

    const result = await controller.admitFromER(
      8,
      { departmentId: 12 },
      adminUser as any,
    );

    expect(result).toEqual({ id: 8, type: 'IPD' });
    expect(encountersService.admitPatientFromER).toHaveBeenCalledWith(9, 8, 12);
  });
});
