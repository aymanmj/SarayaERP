import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { VisitsService } from './visits.service';
import { PrismaService } from '../prisma/prisma.service';

describe('VisitsService', () => {
  let service: VisitsService;
  let prisma: any;

  beforeEach(async () => {
    prisma = {
      encounter: {
        findUnique: jest.fn(),
      },
      visit: {
        create: jest.fn(),
        findMany: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VisitsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<VisitsService>(VisitsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createVisit', () => {
    it('creates a visit for an open encounter and normalizes optional fields', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        id: 10,
        status: 'OPEN',
      });
      prisma.visit.create.mockResolvedValue({
        id: 1,
        encounterId: 10,
        doctorId: 5,
        notes: null,
        diagnosisText: null,
      });

      const result = await service.createVisit({
        encounterId: 10,
        doctorId: 5,
      });

      expect(result.id).toBe(1);
      expect(prisma.visit.create).toHaveBeenCalledWith({
        data: {
          encounterId: 10,
          doctorId: 5,
          notes: null,
          diagnosisText: null,
        },
      });
    });

    it('rejects creating a visit for a missing encounter', async () => {
      prisma.encounter.findUnique.mockResolvedValue(null);

      await expect(
        service.createVisit({
          encounterId: 999,
          doctorId: 5,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects creating a visit for a closed encounter', async () => {
      prisma.encounter.findUnique.mockResolvedValue({
        id: 10,
        status: 'CLOSED',
      });

      await expect(
        service.createVisit({
          encounterId: 10,
          doctorId: 5,
          notes: 'follow-up',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('listForEncounter', () => {
    it('lists visits in chronological order for the encounter', async () => {
      prisma.visit.findMany.mockResolvedValue([{ id: 1 }, { id: 2 }]);

      const result = await service.listForEncounter(10);

      expect(result).toEqual([{ id: 1 }, { id: 2 }]);
      expect(prisma.visit.findMany).toHaveBeenCalledWith({
        where: { encounterId: 10 },
        orderBy: { visitDate: 'asc' },
      });
    });
  });
});
