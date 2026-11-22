import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { BedStatus } from '@prisma/client';
import { BedsService } from './beds.service';
import { ACTIVE_TRANSFER_ORDERS } from './bed-allocation';
import { PrismaService } from '../prisma/prisma.service';

interface BedsPrismaMock {
  $transaction: jest.Mock;
  $queryRaw: jest.Mock;
  bed: {
    findFirst: jest.Mock;
    findMany: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  bedAssignment: {
    count: jest.Mock;
    findMany: jest.Mock;
  };
  transferOrder: {
    count: jest.Mock;
  };
  auditLog: {
    findMany: jest.Mock;
  };
}

describe('BedsService', () => {
  let service: BedsService;
  const prisma: BedsPrismaMock = {
    $transaction: jest.fn(),
    $queryRaw: jest.fn(),
    bed: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    bedAssignment: {
      count: jest.fn(),
      findMany: jest.fn(),
    },
    transferOrder: {
      count: jest.fn(),
    },
    auditLog: {
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.$transaction.mockImplementation(
      (fn: (tx: BedsPrismaMock) => unknown) => fn(prisma),
    );
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BedsService,
        {
          provide: PrismaService,
          useValue: prisma,
        },
      ],
    }).compile();

    service = module.get<BedsService>(BedsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updateBed maintenance safety', () => {
    it('rejects changing bed status when an active transfer reservation exists', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      prisma.bed.findFirst.mockResolvedValue({
        id: 10,
        hospitalId: 1,
        bedNumber: 'B-10',
        status: BedStatus.AVAILABLE,
        isActive: true,
      });
      prisma.bedAssignment.count.mockResolvedValue(0);
      prisma.transferOrder.count.mockResolvedValue(1);

      await expect(
        service.updateBed(1, 10, { status: BedStatus.MAINTENANCE }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.bed.update).not.toHaveBeenCalled();
    });

    it('rejects changing bed status when an active bed assignment exists', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      prisma.bed.findFirst.mockResolvedValue({
        id: 11,
        hospitalId: 1,
        bedNumber: 'B-11',
        status: BedStatus.BLOCKED,
        isActive: true,
      });
      prisma.bedAssignment.count.mockResolvedValue(1);
      prisma.transferOrder.count.mockResolvedValue(0);

      await expect(
        service.updateBed(1, 11, { status: BedStatus.AVAILABLE }),
      ).rejects.toThrow(BadRequestException);
      expect(prisma.bed.update).not.toHaveBeenCalled();
    });

    it('allows switching unreserved AVAILABLE <-> MAINTENANCE safely', async () => {
      prisma.$queryRaw.mockResolvedValue([]);
      prisma.bed.findFirst.mockResolvedValue({
        id: 12,
        hospitalId: 1,
        bedNumber: 'B-12',
        status: BedStatus.AVAILABLE,
        isActive: true,
      });
      prisma.bedAssignment.count.mockResolvedValue(0);
      prisma.transferOrder.count.mockResolvedValue(0);
      prisma.bed.update.mockResolvedValue({
        id: 12,
        status: BedStatus.MAINTENANCE,
      });

      const res = await service.updateBed(1, 12, {
        status: BedStatus.MAINTENANCE,
      });
      expect(res.status).toBe(BedStatus.MAINTENANCE);
      expect(prisma.bed.update).toHaveBeenCalledWith({
        where: { id: 12, hospitalId: 1 },
        data: { bedNumber: undefined, status: BedStatus.MAINTENANCE },
      });
    });
  });

  describe('markBedClean', () => {
    it('enforces no active assignment and no pending transfer reservation', async () => {
      prisma.bed.updateMany.mockResolvedValue({ count: 0 });

      await expect(service.markBedClean(1, 15)).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.bed.updateMany).toHaveBeenCalledWith({
        where: {
          id: 15,
          hospitalId: 1,
          isActive: true,
          status: BedStatus.CLEANING,
          assignments: { none: { to: null } },
          transferOrdersTo: {
            none: { status: { in: [...ACTIVE_TRANSFER_ORDERS] } },
          },
        },
        data: { status: BedStatus.AVAILABLE },
      });
    });
  });

  describe('getActivities', () => {
    it('merges bed assignments, releases, and audit logs sorted descending for hospital', async () => {
      prisma.bedAssignment.findMany.mockResolvedValue([
        {
          id: 5,
          from: new Date('2026-11-20T10:00:00Z'),
          to: new Date('2026-11-21T12:00:00Z'),
          bed: { bedNumber: 'B-101', ward: { name: 'ICU' } },
          encounter: { patient: { fullName: 'Patient One' } },
        },
      ]);
      prisma.auditLog.findMany.mockResolvedValue([
        {
          id: 99,
          entityId: 22,
          createdAt: new Date('2026-11-21T14:00:00Z'),
          details: { path: '/beds/beds/22' },
          user: { fullName: 'Nurse Fatima' },
        },
        {
          id: 98,
          entityId: null,
          createdAt: new Date('2026-11-20T09:00:00Z'),
          details: { path: '/beds/mark-clean' },
          user: { fullName: 'Housekeeping Ali' },
        },
      ]);
      prisma.bed.findMany.mockResolvedValue([
        { id: 22, bedNumber: 'B-202', ward: { name: 'Ward A' } },
      ]);

      const activities = await service.getActivities(1, 10);
      expect(prisma.bedAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { hospitalId: 1 }, take: 10 }),
      );
      expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { hospitalId: 1, entity: 'beds' },
          take: 10,
        }),
      );
      expect(activities.map((a) => a.type)).toEqual([
        'MAINTENANCE',
        'RELEASE',
        'ASSIGNMENT',
        'CLEANING',
      ]);
      expect(activities[0].bedNumber).toBe('B-202');
      expect(activities[0].wardName).toBe('Ward A');
      expect(activities[1].patientName).toBe('Patient One');
    });
  });
});
