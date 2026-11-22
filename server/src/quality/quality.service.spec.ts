import { Test, TestingModule } from '@nestjs/testing';
import { QualityService } from './quality.service';
import { PrismaService } from '../prisma/prisma.service';
import { BadRequestException } from '@nestjs/common';
import {
  IncidentStatus,
  IncidentSeverity,
  IncidentType,
  CapaStatus,
} from '@prisma/client';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConfigService } from '@nestjs/config';

type QualityServiceInternals = {
  redisClient: { on: jest.Mock; eval: jest.Mock };
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => {
    return {
      on: jest.fn(),
      eval: jest.fn(),
    };
  });
});

describe('QualityService', () => {
  let service: QualityService;
  let prisma: PrismaService;

  const mockPrisma = {
    clinicalIncident: {
      count: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      groupBy: jest.fn(),
    },
    capaAction: {
      count: jest.fn(),
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'REDIS_HOST') return 'localhost';
      if (key === 'REDIS_PORT') return 6379;
      return null;
    }),
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QualityService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEventEmitter },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<QualityService>(QualityService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('reportIncident', () => {
    it('should generate incident number and calculate review date correctly for MAJOR severity', async () => {
      mockPrisma.clinicalIncident.count.mockResolvedValue(5);
      mockPrisma.clinicalIncident.create.mockResolvedValue({
        id: 1,
        incidentNumber: 'INC-2026-0006',
      });

      const mockEval = jest.fn().mockResolvedValue(6);
      (service as any).redisClient = {
        on: jest.fn(),
        eval: mockEval,
      };

      const dto = {
        incidentDate: '2026-05-17',
        incidentType: 'MEDICATION_ERROR' as any,
        severity: IncidentSeverity.MAJOR,
        description: 'Test',
        location: 'ER',
      };

      await service.reportIncident(1, 2, dto);

      expect(mockEval).toHaveBeenCalled();
      expect(mockPrisma.clinicalIncident.count).toHaveBeenCalledWith({
        where: { hospitalId: 1 },
      });
      const createCall = mockPrisma.clinicalIncident.create.mock.calls[0][0];

      expect(createCall.data.incidentNumber).toMatch(/INC-\d{4}-0006/);

      // MAJOR severity should be +1 day
      const expectedDueDate = new Date();
      expectedDueDate.setDate(expectedDueDate.getDate() + 1);

      expect(
        createCall.data.reviewDueDate.toISOString().substring(0, 10),
      ).toEqual(expectedDueDate.toISOString().substring(0, 10));
    });

    it('should fallback to DB count if Redis eval throws an error', async () => {
      mockPrisma.clinicalIncident.count.mockResolvedValue(10);
      mockPrisma.clinicalIncident.create.mockResolvedValue({
        id: 1,
        incidentNumber: 'INC-2026-0011',
      });

      const mockEval = jest.fn().mockRejectedValue(new Error('Redis Down'));
      (service as any).redisClient = {
        on: jest.fn(),
        eval: mockEval,
      };

      const dto = {
        incidentDate: '2026-05-17',
        incidentType: 'MEDICATION_ERROR' as any,
        severity: IncidentSeverity.MAJOR,
        description: 'Test fallback',
        location: 'ER',
      };

      await service.reportIncident(1, 2, dto);

      expect(mockEval).toHaveBeenCalled();
      // Should query DB count in try block and catch block
      expect(mockPrisma.clinicalIncident.count).toHaveBeenCalledTimes(2);
      const createCall = mockPrisma.clinicalIncident.create.mock.calls[0][0];
      expect(createCall.data.incidentNumber).toMatch(/INC-\d{4}-0011/);
    });
  });

  describe('closeIncident', () => {
    it('should throw BadRequestException if there are open CAPA actions', async () => {
      mockPrisma.clinicalIncident.findFirst.mockResolvedValue({
        id: 1,
        status: IncidentStatus.INVESTIGATED,
      });
      mockPrisma.capaAction.count.mockResolvedValue(1);

      await expect(service.closeIncident(1, 1, 2)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should close incident if all CAPA actions are completed or verified', async () => {
      mockPrisma.clinicalIncident.findFirst.mockResolvedValue({
        id: 1,
        status: IncidentStatus.INVESTIGATED,
      });
      mockPrisma.capaAction.count.mockResolvedValue(0); // 0 open capas
      mockPrisma.clinicalIncident.update.mockResolvedValue({
        id: 1,
        status: IncidentStatus.CLOSED,
      });

      const result = await service.closeIncident(1, 1, 2);
      expect(result.status).toBe(IncidentStatus.CLOSED);
      expect(mockPrisma.clinicalIncident.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: IncidentStatus.CLOSED }),
        }),
      );
    });
  });

  describe('CAPA Management', () => {
    it('should verify CAPA and close it, then check if incident should be CAPA_VERIFIED', async () => {
      mockPrisma.capaAction.findFirst.mockResolvedValue({
        id: 1,
        incidentId: 5,
        status: CapaStatus.COMPLETED,
      });
      mockPrisma.capaAction.update.mockResolvedValue({
        id: 1,
        status: CapaStatus.VERIFIED,
      });
      mockPrisma.capaAction.count.mockResolvedValue(0); // No remaining open
      mockPrisma.clinicalIncident.update.mockResolvedValue({});

      await service.verifyCapaAction(
        1,
        1,
        { verificationNotes: 'Looks good', isEffective: true },
        2,
      );

      expect(mockPrisma.capaAction.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: CapaStatus.VERIFIED,
            isEffective: true,
          }),
        }),
      );
      expect(mockPrisma.clinicalIncident.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 5 },
          data: { status: IncidentStatus.CAPA_VERIFIED },
        }),
      );
    });

    it('should fail to verify CAPA if not completed', async () => {
      mockPrisma.capaAction.findFirst.mockResolvedValue({
        id: 1,
        incidentId: 5,
        status: CapaStatus.IN_PROGRESS,
      });

      await expect(
        service.verifyCapaAction(
          1,
          1,
          { verificationNotes: 'Looks good', isEffective: true },
          2,
        ),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('Anonymous reporter confidentiality and tenant scope', () => {
    it('redacts reporter and emits anonymous event flag on anonymous incident report', async () => {
      mockPrisma.clinicalIncident.count.mockResolvedValue(0);
      mockPrisma.clinicalIncident.create.mockResolvedValue({
        id: 77,
        incidentNumber: 'INC-2026-0001',
        severity: IncidentSeverity.MODERATE,
        reportedById: 9,
        isAnonymous: true,
        reporter: { id: 9, fullName: 'Dr. Secret Reporter' },
      });

      (service as unknown as QualityServiceInternals).redisClient = {
        on: jest.fn(),
        eval: jest.fn().mockResolvedValue(1),
      };

      const res = await service.reportIncident(1, 9, {
        incidentDate: '2026-11-22',
        incidentType: IncidentType.MEDICATION_ERROR,
        severity: IncidentSeverity.MODERATE,
        description: 'Anonymous report test with enough length',
        isAnonymous: true,
      });

      expect(res.reporter).toBeNull();
      expect(res.reportedById).toBeNull();
      expect(mockEventEmitter.emit).toHaveBeenCalledWith(
        'quality.incident_reported',
        {
          hospitalId: 1,
          incidentId: 77,
          incidentNumber: 'INC-2026-0001',
          severity: IncidentSeverity.MODERATE,
          isAnonymous: true,
          reporterName: 'مبلغ مجهول الهوية',
        },
      );
    });

    it('redacts reporter in findOne, findAll, updateIncident, and closeIncident when isAnonymous is true', async () => {
      const anonymousRow = {
        id: 88,
        hospitalId: 1,
        reportedById: 14,
        isAnonymous: true,
        status: IncidentStatus.REPORTED,
        reporter: { id: 14, fullName: 'Nurse Secret' },
      };

      mockPrisma.clinicalIncident.findFirst.mockResolvedValue(anonymousRow);
      const one = await service.findOne(1, 88);
      expect(one.reporter).toBeNull();
      expect(one.reportedById).toBeNull();

      mockPrisma.$transaction.mockResolvedValue([[anonymousRow], 1]);
      const list = await service.findAll({ hospitalId: 1 });
      expect(list.items[0].reporter).toBeNull();
      expect(list.items[0].reportedById).toBeNull();

      mockPrisma.clinicalIncident.update.mockResolvedValue({
        ...anonymousRow,
        investigationNotes: 'Reviewed',
      });
      const updated = (await service.updateIncident(
        1,
        88,
        { investigationNotes: 'Reviewed' },
        2,
      )) as unknown as { reporter?: unknown; reportedById?: number | null };
      expect(updated.reporter).toBeNull();
      expect(updated.reportedById).toBeNull();

      mockPrisma.capaAction.count.mockResolvedValue(0);
      mockPrisma.clinicalIncident.update.mockResolvedValue({
        ...anonymousRow,
        status: IncidentStatus.CLOSED,
      });
      const closed = (await service.closeIncident(1, 88, 2)) as unknown as {
        reporter?: unknown;
        reportedById?: number | null;
      };
      expect(closed.reporter).toBeNull();
      expect(closed.reportedById).toBeNull();
    });

    it('scopes getMyCapaTasks to the caller hospitalId', async () => {
      mockPrisma.capaAction.findMany.mockResolvedValue([]);
      await service.getMyCapaTasks(3, 42);

      const findCall = mockPrisma.capaAction.findMany.mock.calls[0] as [
        {
          where: {
            assignedToId: number;
            incident: { hospitalId: number };
          };
        },
      ];
      expect(findCall[0].where).toMatchObject({
        assignedToId: 42,
        incident: { hospitalId: 3 },
      });
    });
  });
});
