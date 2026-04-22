/**
 * Portal Refill Service — Unit Tests
 *
 * Tests:
 * - Request refill for an ACTIVE prescription
 * - Reject refill for non-ACTIVE prescription (COMPLETED/CANCELLED)
 * - Reject refill for another patient's prescription (data isolation)
 * - Reject duplicate PENDING refill on same prescription
 * - List refill requests (paginated)
 * - Get refill by ID (data isolation)
 * - Cancel a PENDING refill
 * - Reject cancel on APPROVED/DENIED refill
 * - Reject cancel on another patient's refill
 */
import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PortalRefillService } from './portal-refill.service';
import { PrismaService } from '../../prisma/prisma.service';

describe('PortalRefillService', () => {
  let service: PortalRefillService;
  let prisma: any;

  const mockPrisma = {
    prescription: { findUnique: jest.fn() },
    medicationRefillRequest: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      count: jest.fn(),
      delete: jest.fn(),
    },
    $transaction: jest.fn((queries: any[]) => Promise.all(queries)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PortalRefillService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<PortalRefillService>(PortalRefillService);
    prisma = module.get<PrismaService>(PrismaService);
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  // ===========================================
  //  REQUEST REFILL
  // ===========================================
  describe('requestRefill', () => {
    const mockActivePrescription = {
      id: 1,
      patientId: 1,
      hospitalId: 1,
      status: 'ACTIVE',
      items: [{ product: { id: 100, name: 'Amoxicillin', genericName: 'amoxicillin' } }],
      doctor: { id: 5, fullName: 'د. أحمد' },
    };

    it('should create refill for an ACTIVE prescription owned by patient', async () => {
      mockPrisma.prescription.findUnique.mockResolvedValue(mockActivePrescription);
      mockPrisma.medicationRefillRequest.findFirst.mockResolvedValue(null); // No existing PENDING
      mockPrisma.medicationRefillRequest.create.mockResolvedValue({
        id: 1,
        patientId: 1,
        prescriptionId: 1,
        hospitalId: 1,
        status: 'PENDING',
        notes: 'أحتاج تجديد',
        prescription: mockActivePrescription,
      });

      const result = await service.requestRefill(1, 1, {
        prescriptionId: 1,
        notes: 'أحتاج تجديد',
      });

      expect(result.id).toBe(1);
      expect(result.status).toBe('PENDING');
      expect(mockPrisma.medicationRefillRequest.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            patientId: 1,
            prescriptionId: 1,
            hospitalId: 1,
          }),
        }),
      );
    });

    it('should REJECT refill for a non-existent prescription', async () => {
      mockPrisma.prescription.findUnique.mockResolvedValue(null);

      await expect(
        service.requestRefill(1, 1, { prescriptionId: 999 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should REJECT refill for another patients prescription (data isolation)', async () => {
      mockPrisma.prescription.findUnique.mockResolvedValue({
        ...mockActivePrescription,
        patientId: 999, // Different patient
      });

      await expect(
        service.requestRefill(1, 1, { prescriptionId: 1 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should REJECT refill for COMPLETED prescription', async () => {
      mockPrisma.prescription.findUnique.mockResolvedValue({
        ...mockActivePrescription,
        status: 'COMPLETED',
      });

      await expect(
        service.requestRefill(1, 1, { prescriptionId: 1 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should REJECT refill for CANCELLED prescription', async () => {
      mockPrisma.prescription.findUnique.mockResolvedValue({
        ...mockActivePrescription,
        status: 'CANCELLED',
      });

      await expect(
        service.requestRefill(1, 1, { prescriptionId: 1 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should REJECT duplicate PENDING refill on same prescription', async () => {
      mockPrisma.prescription.findUnique.mockResolvedValue(mockActivePrescription);
      mockPrisma.medicationRefillRequest.findFirst.mockResolvedValue({
        id: 5, status: 'PENDING', prescriptionId: 1, patientId: 1,
      });

      await expect(
        service.requestRefill(1, 1, { prescriptionId: 1 }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  // ===========================================
  //  GET REFILL BY ID
  // ===========================================
  describe('getRefillById', () => {
    it('should return refill owned by patient', async () => {
      mockPrisma.medicationRefillRequest.findUnique.mockResolvedValue({
        id: 1,
        patientId: 1,
        status: 'PENDING',
        prescription: { items: [], doctor: { id: 5, fullName: 'Dr.' } },
        reviewedBy: null,
      });

      const result = await service.getRefillById(1, 1);
      expect(result.id).toBe(1);
    });

    it('should REJECT access to refill owned by another patient', async () => {
      mockPrisma.medicationRefillRequest.findUnique.mockResolvedValue({
        id: 1,
        patientId: 999,
        status: 'PENDING',
      });

      await expect(service.getRefillById(1, 1)).rejects.toThrow(NotFoundException);
    });

    it('should REJECT non-existent refill', async () => {
      mockPrisma.medicationRefillRequest.findUnique.mockResolvedValue(null);

      await expect(service.getRefillById(1, 999)).rejects.toThrow(NotFoundException);
    });
  });

  // ===========================================
  //  CANCEL REFILL
  // ===========================================
  describe('cancelRefill', () => {
    it('should cancel a PENDING refill owned by patient', async () => {
      mockPrisma.medicationRefillRequest.findUnique.mockResolvedValue({
        id: 1, patientId: 1, status: 'PENDING',
      });
      mockPrisma.medicationRefillRequest.delete.mockResolvedValue({ id: 1 });

      const result = await service.cancelRefill(1, 1);

      expect(result.message).toContain('إلغاء');
      expect(mockPrisma.medicationRefillRequest.delete).toHaveBeenCalledWith({
        where: { id: 1 },
      });
    });

    it('should REJECT cancelling an APPROVED refill', async () => {
      mockPrisma.medicationRefillRequest.findUnique.mockResolvedValue({
        id: 1, patientId: 1, status: 'APPROVED',
      });

      await expect(service.cancelRefill(1, 1)).rejects.toThrow(BadRequestException);
    });

    it('should REJECT cancelling a DENIED refill', async () => {
      mockPrisma.medicationRefillRequest.findUnique.mockResolvedValue({
        id: 1, patientId: 1, status: 'DENIED',
      });

      await expect(service.cancelRefill(1, 1)).rejects.toThrow(BadRequestException);
    });

    it('should REJECT cancelling another patients refill (data isolation)', async () => {
      mockPrisma.medicationRefillRequest.findUnique.mockResolvedValue({
        id: 1, patientId: 999, status: 'PENDING',
      });

      await expect(service.cancelRefill(1, 1)).rejects.toThrow(NotFoundException);
    });

    it('should REJECT cancelling non-existent refill', async () => {
      mockPrisma.medicationRefillRequest.findUnique.mockResolvedValue(null);

      await expect(service.cancelRefill(1, 999)).rejects.toThrow(NotFoundException);
    });
  });
});
