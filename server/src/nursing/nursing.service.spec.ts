import { Test, TestingModule } from '@nestjs/testing';
import { NursingService } from './nursing.service';
import { PrismaService } from '../prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';

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
    prescription: { findMany: jest.fn() },
    medicationAdministration: { findMany: jest.fn() },
    encounter: { findMany: jest.fn() },
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
      mockPrisma.prescription.findMany.mockResolvedValue([{
        items: [mockPrescriptionItem('DAILY')],
      }]);

      const schedule = await service.generateMARSchedule(1, 100, new Date('2026-05-04'));

      expect(schedule).toHaveLength(1);
      expect(schedule[0].scheduledTime.getHours()).toBe(8);
      expect(schedule[0].scheduledTime.getMinutes()).toBe(0);
    });

    it('should generate 2 slots for BID frequency at 08:00 and 20:00', async () => {
      mockPrisma.prescription.findMany.mockResolvedValue([{
        items: [mockPrescriptionItem('BID')],
      }]);

      const schedule = await service.generateMARSchedule(1, 100, new Date('2026-05-04'));

      expect(schedule).toHaveLength(2);
      expect(schedule[0].scheduledTime.getHours()).toBe(8);
      expect(schedule[1].scheduledTime.getHours()).toBe(20);
    });

    it('should generate 3 slots for TID frequency at 08:00, 14:00, 20:00', async () => {
      mockPrisma.prescription.findMany.mockResolvedValue([{
        items: [mockPrescriptionItem('TID')],
      }]);

      const schedule = await service.generateMARSchedule(1, 100, new Date('2026-05-04'));

      expect(schedule).toHaveLength(3);
      const hours = schedule.map((s: any) => s.scheduledTime.getHours());
      expect(hours).toEqual([8, 14, 20]);
    });

    it('should generate 4 slots for QID frequency — all within the same calendar day', async () => {
      mockPrisma.prescription.findMany.mockResolvedValue([{
        items: [mockPrescriptionItem('QID')],
      }]);

      const targetDate = new Date('2026-05-04');
      const schedule = await service.generateMARSchedule(1, 100, targetDate);

      expect(schedule).toHaveLength(4);

      // ALL slots must be on the same day (May 4th)
      for (const slot of schedule) {
        expect(slot.scheduledTime.getDate()).toBe(4);
        expect(slot.scheduledTime.getMonth()).toBe(4); // May = 4 (0-indexed)
      }

      // The last slot must NOT overflow to midnight of the next day
      const lastSlot = schedule[schedule.length - 1];
      expect(lastSlot.scheduledTime.getHours()).toBe(23);
      expect(lastSlot.scheduledTime.getMinutes()).toBe(59);
    });

    it('should generate 1 slot for QHS frequency at 22:00', async () => {
      mockPrisma.prescription.findMany.mockResolvedValue([{
        items: [mockPrescriptionItem('QHS')],
      }]);

      const schedule = await service.generateMARSchedule(1, 100, new Date('2026-05-04'));

      expect(schedule).toHaveLength(1);
      expect(schedule[0].scheduledTime.getHours()).toBe(22);
    });

    it('should generate 0 slots for PRN (as-needed) frequency', async () => {
      mockPrisma.prescription.findMany.mockResolvedValue([{
        items: [mockPrescriptionItem('PRN')],
      }]);

      const schedule = await service.generateMARSchedule(1, 100, new Date('2026-05-04'));

      expect(schedule).toHaveLength(0);
    });
  });

  // ============================================
  // Slot Status
  // ============================================
  describe('Slot Status', () => {
    it('should mark slots as PENDING when no administration record exists', async () => {
      mockPrisma.prescription.findMany.mockResolvedValue([{
        items: [mockPrescriptionItem('DAILY')],
      }]);
      mockPrisma.medicationAdministration.findMany.mockResolvedValue([]);

      // Use a future date to avoid OVERDUE
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);
      const schedule = await service.generateMARSchedule(1, 100, futureDate);

      expect(schedule[0].status).toBe('PENDING');
      expect(schedule[0].isOverdue).toBe(false);
    });

    it('should map administration record status when matched to a slot', async () => {
      const targetDate = new Date();
      targetDate.setHours(0, 0, 0, 0);

      mockPrisma.prescription.findMany.mockResolvedValue([{
        items: [mockPrescriptionItem('DAILY')],
      }]);

      // Admin record at 08:30 matches the 08:00 slot (within +/- 2 hour window)
      mockPrisma.medicationAdministration.findMany.mockResolvedValue([{
        prescriptionItemId: 1,
        administeredAt: new Date(targetDate.getTime() + 8.5 * 60 * 60 * 1000),
        status: 'GIVEN',
      }]);

      const schedule = await service.generateMARSchedule(1, 100, targetDate);

      expect(schedule[0].status).toBe('GIVEN');
    });
  });

  // ============================================
  // Sort Order
  // ============================================
  describe('Sort Order', () => {
    it('should sort schedule by scheduledTime ascending', async () => {
      mockPrisma.prescription.findMany.mockResolvedValue([{
        items: [mockPrescriptionItem('QID')],
      }]);
      mockPrisma.medicationAdministration.findMany.mockResolvedValue([]);

      const schedule = await service.generateMARSchedule(1, 100, new Date('2026-05-04'));

      for (let i = 1; i < schedule.length; i++) {
        expect(schedule[i].scheduledTime.getTime())
          .toBeGreaterThanOrEqual(schedule[i - 1].scheduledTime.getTime());
      }
    });
  });
});
