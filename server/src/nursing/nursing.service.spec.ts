import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { CareTaskStatus } from '@prisma/client';
import { NursingService } from './nursing.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { TimeZoneUtils } from '../common/utils/date.util';

/**
 * Unit tests for NursingService MAR scheduling logic.
 * Focuses on slot generation boundaries, frequency coverage, and the QID fix.
 */
describe('NursingService - MAR Schedule', () => {
  let service: NursingService;

  const mockPrescriptionItem = (frequency: string) => ({
    id: 1,
    frequency,
    dose: '500mg',
    route: 'ORAL',
    product: { name: 'Paracetamol' },
  });

  const mockPrisma = {
    hospital: { findUniqueOrThrow: jest.fn() },
    prescription: { findMany: jest.fn() },
    medicationAdministration: { findMany: jest.fn() },
    encounter: { findMany: jest.fn(), findFirst: jest.fn() },
    careTask: { findMany: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
  };

  const mockEventEmitter = {
    emit: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NursingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<NursingService>(NursingService);
    jest.clearAllMocks();
    mockPrisma.hospital.findUniqueOrThrow.mockResolvedValue({
      organization: { timezone: 'Africa/Tripoli' },
    });
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ============================================
  // Slot Generation
  // ============================================
  describe('Slot Generation', () => {
    beforeEach(() => {
      mockPrisma.medicationAdministration.findMany.mockResolvedValue([]);
    });

    it('should generate 1 slot for DAILY frequency at 08:00', async () => {
      mockPrisma.prescription.findMany.mockResolvedValue([
        {
          items: [mockPrescriptionItem('DAILY')],
        },
      ]);

      const schedule = await service.generateMARSchedule(
        1,
        100,
        new Date('2026-05-04'),
      );

      expect(schedule).toHaveLength(1);
      expect(schedule[0].scheduledSlot).toBe('2026-05-04T08:00');
      expect(schedule[0].scheduledTime.toISOString()).toBe(
        '2026-05-04T06:00:00.000Z',
      );
    });

    it('should generate 2 slots for BID frequency at 08:00 and 20:00', async () => {
      mockPrisma.prescription.findMany.mockResolvedValue([
        {
          items: [mockPrescriptionItem('BID')],
        },
      ]);

      const schedule = await service.generateMARSchedule(
        1,
        100,
        new Date('2026-05-04'),
      );

      expect(schedule).toHaveLength(2);
      expect(schedule.map((slot) => slot.scheduledSlot.slice(11))).toEqual([
        '08:00',
        '20:00',
      ]);
    });

    it('should generate 3 slots for TID frequency at 08:00, 14:00, 20:00', async () => {
      mockPrisma.prescription.findMany.mockResolvedValue([
        {
          items: [mockPrescriptionItem('TID')],
        },
      ]);

      const schedule = await service.generateMARSchedule(
        1,
        100,
        new Date('2026-05-04'),
      );

      expect(schedule).toHaveLength(3);
      expect(schedule.map((slot) => slot.scheduledSlot.slice(11))).toEqual([
        '08:00',
        '14:00',
        '20:00',
      ]);
    });

    it('should generate 4 slots for QID frequency — all within the same calendar day', async () => {
      mockPrisma.prescription.findMany.mockResolvedValue([
        {
          items: [mockPrescriptionItem('QID')],
        },
      ]);

      const targetDate = new Date('2026-05-04');
      const schedule = await service.generateMARSchedule(1, 100, targetDate);

      expect(schedule).toHaveLength(4);

      // ALL slots must be on the same day (May 4th)
      for (const slot of schedule) {
        expect(slot.scheduledSlot.startsWith('2026-05-04T')).toBe(true);
      }

      // The last slot must NOT overflow to midnight of the next day
      const lastSlot = schedule[schedule.length - 1];
      expect(lastSlot.scheduledSlot).toBe('2026-05-04T23:59');
    });

    it('should generate 1 slot for QHS frequency at 22:00', async () => {
      mockPrisma.prescription.findMany.mockResolvedValue([
        {
          items: [mockPrescriptionItem('QHS')],
        },
      ]);

      const schedule = await service.generateMARSchedule(
        1,
        100,
        new Date('2026-05-04'),
      );

      expect(schedule).toHaveLength(1);
      expect(schedule[0].scheduledSlot).toBe('2026-05-04T22:00');
    });

    it('should generate 0 slots for PRN (as-needed) frequency', async () => {
      mockPrisma.prescription.findMany.mockResolvedValue([
        {
          items: [mockPrescriptionItem('PRN')],
        },
      ]);

      const schedule = await service.generateMARSchedule(
        1,
        100,
        new Date('2026-05-04'),
      );

      expect(schedule).toHaveLength(0);
    });
  });

  // ============================================
  // Slot Status
  // ============================================
  describe('Slot Status', () => {
    it('should mark slots as PENDING when no administration record exists', async () => {
      mockPrisma.prescription.findMany.mockResolvedValue([
        {
          items: [mockPrescriptionItem('DAILY')],
        },
      ]);
      mockPrisma.medicationAdministration.findMany.mockResolvedValue([]);

      // Use a future date to avoid OVERDUE
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      const schedule = await service.generateMARSchedule(1, 100, futureDate);

      expect(schedule[0].status).toBe('PENDING');
      expect(schedule[0].isOverdue).toBe(false);
    });

    it('should map administration record status when matched to a slot', async () => {
      const targetDate = '2026-05-04';

      mockPrisma.prescription.findMany.mockResolvedValue([
        {
          items: [mockPrescriptionItem('DAILY')],
        },
      ]);

      // A recorded slot stays linked even if its action was documented the next day.
      mockPrisma.medicationAdministration.findMany.mockResolvedValue([
        {
          prescriptionItemId: 1,
          scheduledSlot: `${targetDate}T08:00`,
          scheduledFor: TimeZoneUtils.fromLocal(targetDate, '08:00'),
          administeredAt: new Date('2026-05-05T08:30:00Z'),
          status: 'GIVEN',
        },
      ]);

      const schedule = await service.generateMARSchedule(1, 100, targetDate);

      expect(schedule[0].status).toBe('GIVEN');
    });
  });

  // ============================================
  // Sort Order
  // ============================================
  describe('Sort Order', () => {
    it('should sort schedule by scheduledTime ascending', async () => {
      mockPrisma.prescription.findMany.mockResolvedValue([
        {
          items: [mockPrescriptionItem('QID')],
        },
      ]);
      mockPrisma.medicationAdministration.findMany.mockResolvedValue([]);

      const schedule = await service.generateMARSchedule(
        1,
        100,
        new Date('2026-05-04'),
      );

      for (let i = 1; i < schedule.length; i++) {
        expect(schedule[i].scheduledTime.getTime()).toBeGreaterThanOrEqual(
          schedule[i - 1].scheduledTime.getTime(),
        );
      }
    });
  });

  // ============================================
  // Care Tasks Tenant Isolation (SEC03)
  // ============================================
  describe('Care Tasks Tenant Isolation', () => {
    it('rejects getCareTasks when encounter does not belong to hospitalId', async () => {
      mockPrisma.encounter.findFirst.mockResolvedValue(null);

      await expect(service.getCareTasks(2, 100)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockPrisma.careTask.findMany).not.toHaveBeenCalled();
    });

    it('returns care tasks scoped by encounterId and hospitalId', async () => {
      mockPrisma.encounter.findFirst.mockResolvedValue({ id: 100 });
      mockPrisma.careTask.findMany.mockResolvedValue([{ id: 5 }]);

      const tasks = await service.getCareTasks(1, 100);

      expect(tasks).toEqual([{ id: 5 }]);
      expect(mockPrisma.careTask.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            enrollment: { encounterId: 100, pathway: { hospitalId: 1 } },
          },
        }),
      );
    });

    it('rejects updateCareTaskStatus when task does not belong to hospitalId', async () => {
      mockPrisma.careTask.findFirst.mockResolvedValue(null);

      await expect(
        service.updateCareTaskStatus(2, 7, 55, CareTaskStatus.COMPLETED),
      ).rejects.toThrow(NotFoundException);
      expect(mockPrisma.careTask.update).not.toHaveBeenCalled();
    });

    it('updates care task status when task and encounter belong to hospitalId', async () => {
      mockPrisma.careTask.findFirst.mockResolvedValue({
        id: 55,
        enrollment: { encounterId: 100 },
      });
      mockPrisma.encounter.findFirst.mockResolvedValue({ id: 100 });
      mockPrisma.careTask.update.mockResolvedValue({
        id: 55,
        status: CareTaskStatus.COMPLETED,
      });

      const updated = await service.updateCareTaskStatus(
        1,
        7,
        55,
        CareTaskStatus.COMPLETED,
        'done',
      );

      expect(updated).toEqual({ id: 55, status: CareTaskStatus.COMPLETED });
      expect(mockPrisma.careTask.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 55 },
          data: expect.objectContaining({
            status: CareTaskStatus.COMPLETED,
            notes: 'done',
            completedById: 7,
          }),
        }),
      );
    });
  });
});
